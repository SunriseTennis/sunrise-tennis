-- Plan 14 follow-up: availability RPCs falsely raised "coach not found" when
-- the coach row exists but `user_id IS NULL` (e.g. George — onboarded but
-- hasn't claimed an account yet). The original guard collapsed two distinct
-- cases ("row missing" and "row unclaimed") into the same NULL check, so admin
-- editing an unclaimed coach's availability hit the same error path as a
-- non-existent coach.
--
-- Fix: separate the two checks. Coach must exist (FOUND); ownership match is
-- only relevant when v_coach_user_id IS NOT NULL. Admin always passes.
--
-- Touches: apply_coach_availability_changes, set_coach_availability_bulk,
--          add_coach_exception_range.

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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coach not found';
  END IF;

  -- Coach may exist but be unclaimed (user_id NULL). In that case only admin
  -- can edit — there's no owner identity to compare to.
  IF NOT (
    is_admin(v_caller_user_id)
    OR (v_coach_user_id IS NOT NULL AND v_caller_user_id = v_coach_user_id)
  ) THEN
    RAISE EXCEPTION 'unauthorized: not admin or owner';
  END IF;

  IF p_delete_ids IS NOT NULL AND array_length(p_delete_ids, 1) > 100 THEN
    RAISE EXCEPTION 'too many deletes in single call (>100)';
  END IF;
  IF jsonb_typeof(p_inserts) <> 'array' THEN
    RAISE EXCEPTION 'p_inserts must be a JSON array';
  END IF;
  IF jsonb_array_length(p_inserts) > 100 THEN
    RAISE EXCEPTION 'too many inserts in single call (>100)';
  END IF;

  IF p_delete_ids IS NOT NULL AND array_length(p_delete_ids, 1) > 0 THEN
    DELETE FROM coach_availability
    WHERE coach_id = p_coach_id
      AND id = ANY(p_delete_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

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


CREATE OR REPLACE FUNCTION set_coach_availability_bulk(
  p_coach_id uuid,
  p_days int[],
  p_blocks jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_user_id uuid := auth.uid();
  v_coach_user_id uuid;
  v_block jsonb;
  v_day int;
  v_inserted int := 0;
BEGIN
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no auth.uid()';
  END IF;

  SELECT user_id INTO v_coach_user_id FROM coaches WHERE id = p_coach_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coach not found';
  END IF;

  IF NOT (
    is_admin(v_caller_user_id)
    OR (v_coach_user_id IS NOT NULL AND v_caller_user_id = v_coach_user_id)
  ) THEN
    RAISE EXCEPTION 'unauthorized: not admin or owner';
  END IF;

  IF p_days IS NULL OR array_length(p_days, 1) IS NULL THEN
    RAISE EXCEPTION 'p_days must be a non-empty int[]';
  END IF;
  IF jsonb_typeof(p_blocks) <> 'array' THEN
    RAISE EXCEPTION 'p_blocks must be a JSON array';
  END IF;

  DELETE FROM coach_availability
  WHERE coach_id = p_coach_id
    AND day_of_week = ANY(p_days);

  FOREACH v_day IN ARRAY p_days LOOP
    FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
      BEGIN
        INSERT INTO coach_availability (coach_id, day_of_week, start_time, end_time)
        VALUES (
          p_coach_id,
          v_day,
          (v_block->>'start')::time,
          (v_block->>'end')::time
        )
        ON CONFLICT DO NOTHING;
        IF FOUND THEN v_inserted := v_inserted + 1; END IF;
      EXCEPTION WHEN check_violation THEN
        RAISE EXCEPTION 'invalid time block: % - %', v_block->>'start', v_block->>'end';
      END;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;


-- Drop-then-create because parameter defaults can't be removed via
-- CREATE OR REPLACE (Postgres 42P13). Keeps the same defaults from
-- migration 20260504000003 (DEFAULT NULL on optional params).
DROP FUNCTION IF EXISTS add_coach_exception_range(uuid, date, date, time, time, text);

CREATE OR REPLACE FUNCTION add_coach_exception_range(
  p_coach_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time time DEFAULT NULL,
  p_end_time time DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_user_id uuid := auth.uid();
  v_coach_user_id uuid;
  v_date date;
  v_inserted int := 0;
  v_exists boolean;
BEGIN
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no auth.uid()';
  END IF;

  SELECT user_id INTO v_coach_user_id FROM coaches WHERE id = p_coach_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coach not found';
  END IF;

  IF NOT (
    is_admin(v_caller_user_id)
    OR (v_coach_user_id IS NOT NULL AND v_caller_user_id = v_coach_user_id)
  ) THEN
    RAISE EXCEPTION 'unauthorized: not admin or owner';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date';
  END IF;
  IF (p_end_date - p_start_date) > 365 THEN
    RAISE EXCEPTION 'range too long (>365 days)';
  END IF;
  IF p_start_time IS NOT NULL AND p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'end_time must be > start_time';
  END IF;

  v_date := p_start_date;
  WHILE v_date <= p_end_date LOOP
    SELECT EXISTS (
      SELECT 1 FROM coach_availability_exceptions
      WHERE coach_id = p_coach_id
        AND exception_date = v_date
        AND start_time IS NOT DISTINCT FROM p_start_time
        AND end_time IS NOT DISTINCT FROM p_end_time
    ) INTO v_exists;

    IF NOT v_exists THEN
      INSERT INTO coach_availability_exceptions (
        coach_id, exception_date, start_time, end_time, reason
      ) VALUES (
        p_coach_id, v_date, p_start_time, p_end_time, p_reason
      );
      v_inserted := v_inserted + 1;
    END IF;

    v_date := v_date + INTERVAL '1 day';
  END LOOP;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_coach_availability_changes(uuid, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION set_coach_availability_bulk(uuid, int[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION add_coach_exception_range(uuid, date, date, time, time, text) TO authenticated;
