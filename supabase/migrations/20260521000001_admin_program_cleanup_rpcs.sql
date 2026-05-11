-- Plan 25 follow-up: admin program detail cleanup
--
-- 1. Add missing DELETE RLS policies for `program_coaches` + `program_roster`.
--    Both tables had INSERT/UPDATE policies for admin but NO DELETE. Per the
--    "Missing UPDATE policy = silent no-op" pattern in `.claude/rules/debugging.md`,
--    DELETE under JWT silently filters the row out and reports success — the
--    `removeProgramAssistantCoach` action has been silently no-op'ing since
--    the table was created. Same trap would have bitten any future hard-delete
--    code on program_roster.
--
-- 2. New SECURITY DEFINER RPC `admin_delete_program_player_data(player, program, cascade)`:
--    - Default cascade=false: counts FK dependents (charges, attendances, bookings,
--      lesson_notes), refuses with a structured `blockers` map if any non-zero,
--      otherwise deletes the program_roster row only.
--    - cascade=true: voids all (player, program) charges + deletes attendances +
--      bookings + lesson_notes + roster row, then recalculates family_balance.
--    Same shape as Plan 21 `admin_delete_player` / `admin_delete_family`.

CREATE POLICY "admin_program_coaches_delete" ON program_coaches FOR DELETE
  USING (is_admin(auth.uid()));

CREATE POLICY "admin_program_roster_delete" ON program_roster FOR DELETE
  USING (is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION admin_delete_program_player_data(
  p_player_id uuid,
  p_program_id uuid,
  p_cascade boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blockers jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_count integer;
  v_family_id uuid;
  v_session_ids uuid[];
  v_charges_voided integer := 0;
  v_attendances_deleted integer := 0;
  v_bookings_deleted integer := 0;
  v_lesson_notes_deleted integer := 0;
  v_roster_deleted integer := 0;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  -- Capture family_id for balance recalc later
  SELECT family_id INTO v_family_id FROM players WHERE id = p_player_id;
  IF v_family_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'player not found');
  END IF;

  -- Session IDs for this program (for attendance + lesson-notes scope)
  SELECT array_agg(id) INTO v_session_ids
    FROM sessions WHERE program_id = p_program_id;

  IF NOT p_cascade THEN
    -- Count active dependents
    SELECT COUNT(*) INTO v_count
      FROM charges
     WHERE player_id = p_player_id
       AND program_id = p_program_id
       AND status NOT IN ('voided');
    IF v_count > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('charges', v_count);
      v_total := v_total + v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM attendances
     WHERE player_id = p_player_id
       AND session_id = ANY(COALESCE(v_session_ids, ARRAY[]::uuid[]));
    IF v_count > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('attendances', v_count);
      v_total := v_total + v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM bookings
     WHERE player_id = p_player_id
       AND program_id = p_program_id;
    IF v_count > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('bookings', v_count);
      v_total := v_total + v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM lesson_notes
     WHERE player_id = p_player_id
       AND session_id = ANY(COALESCE(v_session_ids, ARRAY[]::uuid[]));
    IF v_count > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('lesson_notes', v_count);
      v_total := v_total + v_count;
    END IF;

    IF v_total > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'blocked', true,
        'blockers', v_blockers
      );
    END IF;

    -- Clean delete (no dependents). May be a no-op if the player was
    -- casual/trial-only with no roster row — that's fine, return success.
    DELETE FROM program_roster
      WHERE player_id = p_player_id
        AND program_id = p_program_id;
    GET DIAGNOSTICS v_roster_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
      'success', true,
      'blocked', false,
      'deleted', true,
      'cascade', false,
      'roster_deleted', v_roster_deleted
    );
  END IF;

  -- ── Cascade path ──
  -- Void all charges (past + future, all statuses) for this (player, program)
  UPDATE charges
    SET status = 'voided'
    WHERE player_id = p_player_id
      AND program_id = p_program_id
      AND status NOT IN ('voided');
  GET DIAGNOSTICS v_charges_voided = ROW_COUNT;

  -- Delete attendances + lesson_notes for this program's sessions
  IF v_session_ids IS NOT NULL THEN
    DELETE FROM lesson_notes
      WHERE player_id = p_player_id
        AND session_id = ANY(v_session_ids);
    GET DIAGNOSTICS v_lesson_notes_deleted = ROW_COUNT;

    DELETE FROM attendances
      WHERE player_id = p_player_id
        AND session_id = ANY(v_session_ids);
    GET DIAGNOSTICS v_attendances_deleted = ROW_COUNT;
  END IF;

  -- Delete bookings for this (player, program)
  DELETE FROM bookings
    WHERE player_id = p_player_id
      AND program_id = p_program_id;
  GET DIAGNOSTICS v_bookings_deleted = ROW_COUNT;

  -- Delete the roster row (may be 0 if player was casual/trial-only)
  DELETE FROM program_roster
    WHERE player_id = p_player_id
      AND program_id = p_program_id;
  GET DIAGNOSTICS v_roster_deleted = ROW_COUNT;

  -- Recalculate family_balance — voiding charges changes the cache
  PERFORM recalculate_family_balance(v_family_id);

  RETURN jsonb_build_object(
    'success', true,
    'blocked', false,
    'deleted', true,
    'cascade', true,
    'charges_voided', v_charges_voided,
    'attendances_deleted', v_attendances_deleted,
    'lesson_notes_deleted', v_lesson_notes_deleted,
    'bookings_deleted', v_bookings_deleted,
    'roster_deleted', v_roster_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_program_player_data TO authenticated;

COMMENT ON FUNCTION admin_delete_program_player_data IS
  'Admin-only: hard-delete a (player, program) pair. cascade=false (default) refuses if any FK dependents exist (returns structured blockers); cascade=true voids all charges + deletes attendances + bookings + lesson_notes + roster row + recalculates family_balance. Used by the admin program detail page for cleaning up test players.';
