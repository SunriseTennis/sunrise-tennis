-- ─────────────────────────────────────────────────────────────────────────
-- Bundled with Plan 25 — admin_force_delete_test_family RPC.
--
-- Companion to `families.is_test` (20260522000002). Hard-deletes a family
-- AND every dependent row across the schema. Refuses unless is_test=true,
-- so real families can never be nuked by this path even if admin types
-- the wrong UUID.
--
-- Does NOT touch:
--   * sessions: shared with other families' bookings; orphan private
--     sessions stay for manual cleanup if needed.
--   * audit_log / auth_events: compliance trail, intentionally preserved.
--   * auth.users: per debugging.md "Auth user delete blocked by FK" the
--     server-action wrapper handles auth-side cleanup (rename email so
--     the original is freed for re-signup).
--   * coach_earnings / coach_payments / session_coach_attendances: keyed
--     by coach + session; family-agnostic.
--
-- Returns jsonb of shape:
--   { "success": true, "deleted": true, "counts": { table: N, ... } }
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_force_delete_test_family(p_family_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_test          boolean;
  v_display_id       text;
  v_parent_user_ids  uuid[];
  v_player_ids       uuid[];
  v_booking_ids      uuid[];
  v_charge_ids       uuid[];
  v_payment_ids      uuid[];
  v_counts           jsonb := '{}'::jsonb;
  v_n                integer;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  -- Guard: only test families
  SELECT is_test, display_id
    INTO v_is_test, v_display_id
    FROM families WHERE id = p_family_id;

  IF v_is_test IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Family not found');
  END IF;
  IF v_is_test IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Refusing to force-delete a non-test family. Flag families.is_test=true first if this really is a test account.'
    );
  END IF;

  -- ─── Gather id sets BEFORE any deletes ─────────────────────────────
  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[])
    INTO v_parent_user_ids
    FROM user_roles
    WHERE family_id = p_family_id AND role = 'parent';

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_player_ids
    FROM players
    WHERE family_id = p_family_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_booking_ids
    FROM bookings
    WHERE family_id = p_family_id OR second_family_id = p_family_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_charge_ids
    FROM charges WHERE family_id = p_family_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_payment_ids
    FROM payments WHERE family_id = p_family_id;

  -- ─── Grandchildren (depend on player_id / charge_id / payment_id / booking_id) ───
  DELETE FROM payment_allocations
    WHERE charge_id  = ANY(v_charge_ids)
       OR payment_id = ANY(v_payment_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('payment_allocations', v_n);

  DELETE FROM attendances WHERE player_id = ANY(v_player_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('attendances', v_n);

  DELETE FROM lesson_notes WHERE player_id = ANY(v_player_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('lesson_notes', v_n);

  DELETE FROM program_roster WHERE player_id = ANY(v_player_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('program_roster', v_n);

  DELETE FROM player_allowed_coaches WHERE player_id = ANY(v_player_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('player_allowed_coaches', v_n);

  DELETE FROM team_members WHERE player_id = ANY(v_player_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('team_members', v_n);

  DELETE FROM competition_players WHERE player_id = ANY(v_player_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('competition_players', v_n);

  DELETE FROM cancellation_tracker WHERE booking_id = ANY(v_booking_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('cancellation_tracker', v_n);

  DELETE FROM media WHERE player_id = ANY(v_player_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('media', v_n);

  -- ─── Family-scoped children ────────────────────────────────────────
  DELETE FROM bookings WHERE id = ANY(v_booking_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bookings', v_n);

  DELETE FROM charges WHERE id = ANY(v_charge_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('charges', v_n);

  DELETE FROM payments WHERE id = ANY(v_payment_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('payments', v_n);

  DELETE FROM invoices WHERE family_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_n);

  DELETE FROM vouchers WHERE family_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('vouchers', v_n);

  DELETE FROM family_pricing WHERE family_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('family_pricing', v_n);

  DELETE FROM messages WHERE family_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('messages', v_n);

  DELETE FROM referrals
    WHERE referring_family_id = p_family_id
       OR referred_family_id  = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('referrals', v_n);

  DELETE FROM invitations WHERE family_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invitations', v_n);

  DELETE FROM players WHERE family_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('players', v_n);

  -- ─── Notifications + push (user_id-keyed) ──────────────────────────
  DELETE FROM notification_recipients
    WHERE user_id = ANY(v_parent_user_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('notification_recipients', v_n);

  -- notifications targeted at THIS family. Globally-targeted ones stay
  -- (other recipients are unaffected once their recipient rows are dropped
  -- above; this family's user gets no leak because notification_recipients
  -- gated all the visibility).
  DELETE FROM notifications
    WHERE target_type = 'family' AND target_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('notifications', v_n);

  DELETE FROM notification_outbox WHERE user_id = ANY(v_parent_user_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('notification_outbox', v_n);

  DELETE FROM push_subscriptions WHERE user_id = ANY(v_parent_user_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('push_subscriptions', v_n);

  DELETE FROM user_notification_preferences
    WHERE user_id = ANY(v_parent_user_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_notification_preferences', v_n);

  -- ─── Family + role rows ────────────────────────────────────────────
  DELETE FROM family_balance WHERE family_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('family_balance', v_n);

  DELETE FROM user_roles WHERE family_id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_roles', v_n);

  DELETE FROM families WHERE id = p_family_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('families', v_n);

  RETURN jsonb_build_object(
    'success',     true,
    'deleted',     true,
    'display_id',  v_display_id,
    'parent_user_ids', to_jsonb(v_parent_user_ids),
    'counts',      v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_force_delete_test_family(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_force_delete_test_family(uuid) TO authenticated;

COMMENT ON FUNCTION admin_force_delete_test_family(uuid) IS
  'Bundled with Plan 25 (12-May-2026) — admin-only cascade-delete of a family flagged is_test=true. '
  'Refuses on real families. Returns parent_user_ids array so the calling server action can also '
  'rename the orphaned auth.users email (per debugging.md auth-user-delete-FK trap). '
  'Sessions, audit_log, auth_events, coach_earnings preserved.';
