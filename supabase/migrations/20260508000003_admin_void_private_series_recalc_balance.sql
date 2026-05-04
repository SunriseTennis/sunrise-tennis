-- Migration: Fix admin_void_private_series to refresh family_balance
--
-- Bug discovered 04-May-2026: admin/privates → void series hard-deleted
-- charges/bookings/sessions but never refreshed family_balance.projected_balance_cents
-- because the original RPC trusted a DELETE trigger that doesn't exist.
-- Symptom: admin/families showed pre-void totals indefinitely (Delavault
-- $720 stale vs $360 actual after a duplicate-set void).
--
-- Fix: capture distinct family_ids from the affected bookings BEFORE the
-- deletes, then call recalculate_family_balance(fid) for each family at the
-- end of the RPC.
--
-- Also: one-shot backfill across all families to scrub stale rows left by
-- past invocations of this RPC and any other path that bypassed the
-- canonical voidCharge / waiveCharge / voidPayment helpers (notably the
-- Term-2 week-1 wash migration 20260501000005_session_rebuild.sql which
-- deleted/voided charges without recalc).

CREATE OR REPLACE FUNCTION admin_void_private_series(
  p_parent_booking_id uuid,
  p_include_completed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series_ids        uuid[];
  v_session_ids       uuid[];
  v_family_ids        uuid[];
  v_actor_id          uuid := auth.uid();
  v_deleted_bookings  int  := 0;
  v_deleted_sessions  int  := 0;
  v_deleted_charges   int  := 0;
  v_deleted_earnings  int  := 0;
  v_fam               uuid;
BEGIN
  IF NOT is_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  -- Resolve the full series: the row itself + its standing chain + paired
  -- shared-private rows on every session in scope.
  WITH base AS (
    SELECT id, session_id
      FROM bookings
     WHERE id = p_parent_booking_id
        OR standing_parent_id = p_parent_booking_id
  ),
  pairs AS (
    SELECT b2.id, b2.session_id
      FROM base b
      JOIN bookings b2 ON b2.shared_with_booking_id = b.id
  ),
  combined AS (
    SELECT id, session_id FROM base
    UNION
    SELECT id, session_id FROM pairs
  )
  SELECT array_agg(DISTINCT id), array_agg(DISTINCT session_id)
    INTO v_series_ids, v_session_ids
    FROM combined;

  IF v_series_ids IS NULL OR array_length(v_series_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- If the caller hasn't opted in to deleting completed sessions, drop those
  -- session ids out of the scope so we keep their history intact.
  IF NOT p_include_completed THEN
    SELECT COALESCE(array_agg(id), '{}'::uuid[]),
           COALESCE(array_agg(DISTINCT session_id), '{}'::uuid[])
      INTO v_series_ids, v_session_ids
      FROM bookings
     WHERE id = ANY(v_series_ids)
       AND (session_id IS NULL OR session_id IN (
             SELECT id FROM sessions
              WHERE id = ANY(v_session_ids)
                AND status <> 'completed'
           ));
  END IF;

  IF v_series_ids IS NULL OR array_length(v_series_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'deleted_bookings', 0,
      'deleted_sessions', 0,
      'deleted_charges', 0,
      'deleted_earnings', 0,
      'note', 'Nothing in scope (all sessions completed and include_completed=false)'
    );
  END IF;

  -- Capture distinct family_ids of all affected bookings BEFORE the deletes.
  -- Used to recompute family_balance after the deletes (see end of function).
  -- There is NO trigger on charges / payment_allocations DELETE that does
  -- this — earlier comment claiming otherwise was wrong.
  SELECT array_agg(DISTINCT family_id)
    INTO v_family_ids
    FROM bookings
   WHERE id = ANY(v_series_ids);

  -- Delete coach_earnings tied to the sessions
  DELETE FROM coach_earnings
   WHERE session_id = ANY(v_session_ids);
  GET DIAGNOSTICS v_deleted_earnings = ROW_COUNT;

  -- Delete payment_allocations referencing affected charges, then the charges
  DELETE FROM payment_allocations
   WHERE charge_id IN (
     SELECT id FROM charges WHERE booking_id = ANY(v_series_ids)
   );

  DELETE FROM charges
   WHERE booking_id = ANY(v_series_ids);
  GET DIAGNOSTICS v_deleted_charges = ROW_COUNT;

  -- Delete attendances for the sessions
  DELETE FROM attendances
   WHERE session_id = ANY(v_session_ids);

  -- Delete bookings
  DELETE FROM bookings
   WHERE id = ANY(v_series_ids);
  GET DIAGNOSTICS v_deleted_bookings = ROW_COUNT;

  -- Delete sessions (now safe — no FKs left)
  DELETE FROM sessions
   WHERE id = ANY(v_session_ids);
  GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;

  -- Recompute family balances for every family touched.
  IF v_family_ids IS NOT NULL THEN
    FOREACH v_fam IN ARRAY v_family_ids LOOP
      PERFORM recalculate_family_balance(v_fam);
    END LOOP;
  END IF;

  -- Audit-log entry (best-effort — schema may evolve)
  BEGIN
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values)
    VALUES (
      v_actor_id,
      'private.series_voided',
      'booking',
      p_parent_booking_id,
      jsonb_build_object(
        'deleted_bookings',       v_deleted_bookings,
        'deleted_sessions',       v_deleted_sessions,
        'deleted_charges',        v_deleted_charges,
        'deleted_earnings',       v_deleted_earnings,
        'include_completed',      p_include_completed,
        'recalculated_families',  COALESCE(array_length(v_family_ids, 1), 0)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'deleted_bookings',      v_deleted_bookings,
    'deleted_sessions',      v_deleted_sessions,
    'deleted_charges',       v_deleted_charges,
    'deleted_earnings',      v_deleted_earnings,
    'recalculated_families', COALESCE(array_length(v_family_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_void_private_series(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION admin_void_private_series(uuid, boolean) IS
  'Admin-only hard-delete of a private booking series. Removes paired shared rows, charges, allocations, attendances, earnings, sessions. Recomputes family_balance for every affected family (no DELETE trigger does this — must be explicit). Use sparingly (test data cleanup, deliberate void).';

-- One-shot backfill: scrub any stale family_balance rows left by past
-- invocations of admin_void_private_series OR any other path that bypassed
-- the canonical voidCharge/waiveCharge/voidPayment helpers. Safe to run
-- repeatedly — recalculate_family_balance writes ground-truth numbers.
DO $$
DECLARE
  fam RECORD;
BEGIN
  FOR fam IN SELECT id FROM families LOOP
    PERFORM recalculate_family_balance(fam.id);
  END LOOP;
END $$;
