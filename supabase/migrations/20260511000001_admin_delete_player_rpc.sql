-- Plan 21 — admin_delete_player RPC.
--
-- Hard-deletes a player ONLY when the row has zero operational
-- dependents. Counts blockers across every FK pointing at players(id)
-- and returns a structured response. The UI surfaces blockers; admin
-- decides whether to archive instead.
--
-- This is a deliberate escape hatch from the project's archive-not-
-- delete posture, scoped to pre-real-data rows (intake noise from a
-- self-signup wizard). Real-history players still go through archive.
--
-- Returns jsonb of shape:
--   { "success": bool, "blocked": bool, "deleted": bool, "blockers": jsonb }

CREATE OR REPLACE FUNCTION admin_delete_player(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_family_id     uuid;
  v_attendances   integer;
  v_charges       integer;
  v_bookings      integer;
  v_lesson_notes  integer;
  v_media         integer;
  v_roster        integer;
  v_team_members  integer;
  v_team_captain  integer;
  v_competition   integer;
  v_vouchers      integer;
  v_referrals     integer;
  v_messages      integer;
  v_total         integer;
  v_blockers      jsonb := '{}'::jsonb;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  -- Ensure player exists; capture family_id for post-delete recalc.
  SELECT family_id INTO v_family_id FROM players WHERE id = p_player_id;
  IF v_family_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', false,
      'deleted', false,
      'error', 'Player not found'
    );
  END IF;

  -- Count rows pointing at this player across every FK.
  SELECT COUNT(*) INTO v_attendances FROM attendances WHERE player_id = p_player_id;
  SELECT COUNT(*) INTO v_charges
    FROM charges WHERE player_id = p_player_id AND status <> 'voided';
  SELECT COUNT(*) INTO v_bookings
    FROM bookings WHERE player_id = p_player_id OR second_player_id = p_player_id;
  SELECT COUNT(*) INTO v_lesson_notes FROM lesson_notes WHERE player_id = p_player_id;
  SELECT COUNT(*) INTO v_media FROM media WHERE player_id = p_player_id;
  SELECT COUNT(*) INTO v_roster FROM program_roster WHERE player_id = p_player_id;
  SELECT COUNT(*) INTO v_team_members FROM team_members WHERE player_id = p_player_id;
  SELECT COUNT(*) INTO v_team_captain FROM teams WHERE captain_id = p_player_id;
  SELECT COUNT(*) INTO v_competition FROM competition_players WHERE player_id = p_player_id;
  SELECT COUNT(*) INTO v_vouchers FROM vouchers WHERE player_id = p_player_id;
  SELECT COUNT(*) INTO v_referrals FROM referrals WHERE referred_player_id = p_player_id;
  SELECT COUNT(*) INTO v_messages FROM messages WHERE player_id = p_player_id;

  IF v_attendances  > 0 THEN v_blockers := v_blockers || jsonb_build_object('attendances',  v_attendances);  END IF;
  IF v_charges      > 0 THEN v_blockers := v_blockers || jsonb_build_object('charges',      v_charges);      END IF;
  IF v_bookings     > 0 THEN v_blockers := v_blockers || jsonb_build_object('bookings',     v_bookings);     END IF;
  IF v_lesson_notes > 0 THEN v_blockers := v_blockers || jsonb_build_object('lesson_notes', v_lesson_notes); END IF;
  IF v_media        > 0 THEN v_blockers := v_blockers || jsonb_build_object('media',        v_media);        END IF;
  IF v_roster       > 0 THEN v_blockers := v_blockers || jsonb_build_object('program_roster', v_roster);     END IF;
  IF v_team_members > 0 THEN v_blockers := v_blockers || jsonb_build_object('team_members', v_team_members); END IF;
  IF v_team_captain > 0 THEN v_blockers := v_blockers || jsonb_build_object('team_captain', v_team_captain); END IF;
  IF v_competition  > 0 THEN v_blockers := v_blockers || jsonb_build_object('competitions', v_competition);  END IF;
  IF v_vouchers     > 0 THEN v_blockers := v_blockers || jsonb_build_object('vouchers',     v_vouchers);     END IF;
  IF v_referrals    > 0 THEN v_blockers := v_blockers || jsonb_build_object('referrals',    v_referrals);    END IF;
  IF v_messages     > 0 THEN v_blockers := v_blockers || jsonb_build_object('messages',     v_messages);     END IF;

  v_total := v_attendances + v_charges + v_bookings + v_lesson_notes + v_media
           + v_roster + v_team_members + v_team_captain + v_competition
           + v_vouchers + v_referrals + v_messages;

  IF v_total > 0 THEN
    RETURN jsonb_build_object(
      'success',  false,
      'blocked',  true,
      'deleted',  false,
      'blockers', v_blockers
    );
  END IF;

  -- Safe to delete. Allowed-coach rows have no ON DELETE clause; clear them.
  DELETE FROM player_allowed_coaches WHERE player_id = p_player_id;
  DELETE FROM players WHERE id = p_player_id;

  -- Defensive recalc per debugging.md "family_balance staleness". Should
  -- be a no-op since we just confirmed zero charges, but cheap insurance.
  PERFORM recalculate_family_balance(v_family_id);

  RETURN jsonb_build_object(
    'success', true,
    'blocked', false,
    'deleted', true,
    'blockers', '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_player(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_player(uuid) TO authenticated;

COMMENT ON FUNCTION admin_delete_player(uuid) IS
  'Plan 21 — admin-only hard-delete with FK pre-flight. Returns blockers list if any operational rows point at the player; deletes safely otherwise.';
