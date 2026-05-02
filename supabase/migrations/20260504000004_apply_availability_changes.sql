-- Stage-and-save availability writer
-- Combines deletes + inserts for coach_availability into one transactional call.
-- Used by the new edit-mode editor: user adds/removes blocks per-day in the
-- client, hits "Save", and a single RPC call commits everything.
--
-- p_inserts shape: jsonb array of { day: int (0..6), start: "HH:MM", end: "HH:MM" }
-- Each insert can target a different day, so the coach can set different blocks
-- per day in one save (e.g. "Mon 9-12 AND 4-7, Tue 4-7, Fri 9-12").

CREATE OR REPLACE FUNCTION apply_coach_availability_changes(
  p_coach_id uuid,
  p_delete_ids uuid[] DEFAULT '{}'::uuid[],
  p_inserts jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_user_id uuid := auth.uid();
  v_coach_user_id uuid;
  v_insert jsonb;
  v_deleted int := 0;
  v_inserted int := 0;
BEGIN
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no auth.uid()';
  END IF;

  SELECT user_id INTO v_coach_user_id FROM coaches WHERE id = p_coach_id;
  IF v_coach_user_id IS NULL THEN
    RAISE EXCEPTION 'coach not found';
  END IF;

  IF NOT (is_admin(v_caller_user_id) OR v_caller_user_id = v_coach_user_id) THEN
    RAISE EXCEPTION 'unauthorized: not admin or owner';
  END IF;

  -- Volume guards
  IF p_delete_ids IS NOT NULL AND array_length(p_delete_ids, 1) > 100 THEN
    RAISE EXCEPTION 'too many deletes in single call (>100)';
  END IF;
  IF jsonb_typeof(p_inserts) <> 'array' THEN
    RAISE EXCEPTION 'p_inserts must be a JSON array';
  END IF;
  IF jsonb_array_length(p_inserts) > 100 THEN
    RAISE EXCEPTION 'too many inserts in single call (>100)';
  END IF;

  -- Delete first. The coach_id filter prevents touching another coach's rows
  -- even if the caller passes IDs they shouldn't have access to.
  IF p_delete_ids IS NOT NULL AND array_length(p_delete_ids, 1) > 0 THEN
    DELETE FROM coach_availability
    WHERE coach_id = p_coach_id
      AND id = ANY(p_delete_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  -- Then insert. ON CONFLICT DO NOTHING handles re-applying the same set.
  FOR v_insert IN SELECT * FROM jsonb_array_elements(p_inserts) LOOP
    BEGIN
      INSERT INTO coach_availability (coach_id, day_of_week, start_time, end_time)
      VALUES (
        p_coach_id,
        (v_insert->>'day')::int,
        (v_insert->>'start')::time,
        (v_insert->>'end')::time
      )
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    EXCEPTION WHEN check_violation THEN
      RAISE EXCEPTION 'invalid time block: % - %', v_insert->>'start', v_insert->>'end';
    END;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_coach_availability_changes(uuid, uuid[], jsonb) TO authenticated;

COMMENT ON FUNCTION apply_coach_availability_changes(uuid, uuid[], jsonb) IS
  'Stage-and-save: delete listed availability rows + insert per-day blocks in one transaction. Coach owns or admin-only.';
