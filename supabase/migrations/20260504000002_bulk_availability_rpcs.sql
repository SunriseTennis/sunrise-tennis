-- Bulk availability writers
-- Two SECURITY DEFINER functions that let coaches (own) and admins (any coach)
-- write many coach_availability or coach_availability_exceptions rows in one
-- call. Idempotent — re-applying the same set is a no-op.

-- ── set_coach_availability_bulk ────────────────────────────────────────
-- Insert one row per (day, block) combination. Skips conflicts.
-- p_blocks shape: jsonb array of { start: "HH:MM", end: "HH:MM" }
-- Returns the number of rows actually inserted (excludes already-existing).

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
  v_day int;
  v_block jsonb;
  v_inserted int := 0;
BEGIN
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no auth.uid()';
  END IF;

  -- Auth: caller is admin OR caller owns the target coach record.
  SELECT user_id INTO v_coach_user_id FROM coaches WHERE id = p_coach_id;
  IF v_coach_user_id IS NULL THEN
    RAISE EXCEPTION 'coach not found';
  END IF;

  IF NOT (is_admin(v_caller_user_id) OR v_caller_user_id = v_coach_user_id) THEN
    RAISE EXCEPTION 'unauthorized: not admin or owner';
  END IF;

  -- Validate inputs
  IF p_days IS NULL OR array_length(p_days, 1) IS NULL THEN
    RAISE EXCEPTION 'p_days must contain at least one day_of_week';
  END IF;
  IF p_blocks IS NULL OR jsonb_array_length(p_blocks) = 0 THEN
    RAISE EXCEPTION 'p_blocks must contain at least one time block';
  END IF;
  IF array_length(p_days, 1) * jsonb_array_length(p_blocks) > 100 THEN
    RAISE EXCEPTION 'too many rows in single call (>100)';
  END IF;

  FOREACH v_day IN ARRAY p_days LOOP
    IF v_day < 0 OR v_day > 6 THEN
      RAISE EXCEPTION 'day_of_week must be 0..6, got %', v_day;
    END IF;

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
        -- end_time must be > start_time — bubble up so the caller sees real errors
        RAISE EXCEPTION 'invalid time block: % – %', v_block->>'start', v_block->>'end';
      END;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION set_coach_availability_bulk(uuid, int[], jsonb) TO authenticated;

COMMENT ON FUNCTION set_coach_availability_bulk(uuid, int[], jsonb) IS
  'Insert N×M coach_availability rows from (days, blocks). Idempotent. Coach owns or admin-only.';

-- ── add_coach_exception_range ──────────────────────────────────────────
-- Insert one coach_availability_exceptions row per date in [start_date, end_date].
-- Times nullable (NULL = all day). Idempotent: skips dates that already have
-- a matching row (same date AND same start_time signature).

CREATE OR REPLACE FUNCTION add_coach_exception_range(
  p_coach_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time time,
  p_end_time time,
  p_reason text
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
  IF v_coach_user_id IS NULL THEN
    RAISE EXCEPTION 'coach not found';
  END IF;

  IF NOT (is_admin(v_caller_user_id) OR v_caller_user_id = v_coach_user_id) THEN
    RAISE EXCEPTION 'unauthorized: not admin or owner';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date';
  END IF;
  IF p_end_date - p_start_date > 90 THEN
    RAISE EXCEPTION 'date range must be 90 days or fewer';
  END IF;

  -- Either both times set, or both null. Time order check matches table CHECK.
  IF (p_start_time IS NULL) <> (p_end_time IS NULL) THEN
    RAISE EXCEPTION 'start_time and end_time must both be set or both null';
  END IF;
  IF p_start_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'end_time must be after start_time';
  END IF;

  FOR v_date IN SELECT generate_series(p_start_date, p_end_date, interval '1 day')::date LOOP
    -- For all-day (NULL start_time), the UNIQUE constraint can't dedupe NULLs,
    -- so do an explicit EXISTS check.
    IF p_start_time IS NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM coach_availability_exceptions
        WHERE coach_id = p_coach_id
          AND exception_date = v_date
          AND start_time IS NULL
      ) INTO v_exists;
      IF v_exists THEN CONTINUE; END IF;

      INSERT INTO coach_availability_exceptions
        (coach_id, exception_date, start_time, end_time, reason)
      VALUES
        (p_coach_id, v_date, NULL, NULL, p_reason);
      v_inserted := v_inserted + 1;
    ELSE
      INSERT INTO coach_availability_exceptions
        (coach_id, exception_date, start_time, end_time, reason)
      VALUES
        (p_coach_id, v_date, p_start_time, p_end_time, p_reason)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION add_coach_exception_range(uuid, date, date, time, time, text) TO authenticated;

COMMENT ON FUNCTION add_coach_exception_range(uuid, date, date, time, time, text) IS
  'Insert one coach_availability_exceptions row per date in range. Idempotent. Coach owns or admin-only.';
