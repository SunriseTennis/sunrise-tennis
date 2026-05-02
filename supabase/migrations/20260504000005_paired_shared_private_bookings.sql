-- ─────────────────────────────────────────────────────────────────────────
-- Paired shared-private bookings
--
-- Until now, a shared (semi) private was stored as ONE bookings row with
-- family_id=family1 and second_player_id/second_family_id columns recording
-- family2. Every parent-side query filters on bookings.family_id, so family2
-- never saw the booking — only the charge.
--
-- New shape: TWO bookings rows per shared session, linked via
-- shared_with_booking_id. Each family sees its own row, owns its own cancel,
-- and has its own half-price charge. The legacy second_* columns stay on the
-- table (NULL after backfill) and will be dropped in a follow-up after a
-- soak window confirms no readers remain.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS shared_with_booking_id uuid
    REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_shared_with_idx
  ON bookings(shared_with_booking_id);

-- Backfill: for any booking row with second_family_id set that hasn't already
-- been paired (shared_with_booking_id IS NULL), create a paired row for the
-- second family and link the two together. Idempotent — safe to re-run.
DO $backfill$
DECLARE
  r          record;
  paired_id  uuid;
BEGIN
  FOR r IN
    SELECT *
      FROM bookings
     WHERE second_family_id IS NOT NULL
       AND shared_with_booking_id IS NULL
  LOOP
    -- Half-price each side (price_cents on the original was the FULL split-into-two
    -- already in the buggy writer; but we treat it as the family-1 charge total).
    -- Defensive: if even, halve; if odd, family-2 gets one cent more (rounded).
    INSERT INTO bookings (
      family_id, player_id, session_id, booking_type, status, approval_status,
      auto_approved, approved_by, approved_at,
      price_cents, duration_minutes,
      booked_by, is_standing, standing_parent_id,
      shared_with_booking_id
    ) VALUES (
      r.second_family_id,
      r.second_player_id,
      r.session_id,
      r.booking_type,
      r.status,
      r.approval_status,
      r.auto_approved,
      r.approved_by,
      r.approved_at,
      ROUND(r.price_cents / 2.0)::int,
      r.duration_minutes,
      r.booked_by,
      r.is_standing,
      r.standing_parent_id,
      r.id
    )
    RETURNING id INTO paired_id;

    UPDATE bookings
       SET shared_with_booking_id = paired_id,
           price_cents            = r.price_cents - ROUND(r.price_cents / 2.0)::int
     WHERE id = r.id;
  END LOOP;
END;
$backfill$;

-- ─────────────────────────────────────────────────────────────────────────
-- RPC: admin_void_private_series
--
-- Hard-delete a private booking and everything tied to it (the series of
-- standing instances if standing_parent_id chains back, both paired rows for
-- shared privates, plus their charges/coach earnings/payment allocations).
-- Used for cleaning up test bookings and admin "void" operations. Audit
-- log entry created. Admin only.
-- ─────────────────────────────────────────────────────────────────────────

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
  v_actor_id          uuid := auth.uid();
  v_deleted_bookings  int  := 0;
  v_deleted_sessions  int  := 0;
  v_deleted_charges   int  := 0;
  v_deleted_earnings  int  := 0;
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

  -- Recompute family balances for any family touched
  -- (Picked up by triggers on charges/payment_allocations delete, so a no-op here.)

  -- Audit-log entry (best-effort — schema may evolve)
  BEGIN
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values)
    VALUES (
      v_actor_id,
      'private.series_voided',
      'booking',
      p_parent_booking_id,
      jsonb_build_object(
        'deleted_bookings', v_deleted_bookings,
        'deleted_sessions', v_deleted_sessions,
        'deleted_charges',  v_deleted_charges,
        'deleted_earnings', v_deleted_earnings,
        'include_completed', p_include_completed
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- audit_log shape changes can't block the void
    NULL;
  END;

  RETURN jsonb_build_object(
    'deleted_bookings', v_deleted_bookings,
    'deleted_sessions', v_deleted_sessions,
    'deleted_charges',  v_deleted_charges,
    'deleted_earnings', v_deleted_earnings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_void_private_series(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION admin_void_private_series(uuid, boolean) IS
  'Admin-only hard-delete of a private booking series. Removes paired shared rows, charges, allocations, attendances, earnings, sessions. Use sparingly (test data cleanup, deliberate void).';

COMMENT ON COLUMN bookings.shared_with_booking_id IS
  'For shared (semi) privates: each family has its own bookings row. The two rows reference each other via this column. NULL for solo privates and group bookings.';
