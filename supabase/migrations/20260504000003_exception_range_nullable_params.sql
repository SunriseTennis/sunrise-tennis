-- Make optional params on add_coach_exception_range explicitly nullable so the
-- generated TS types reflect 'time | null' / 'text | null'. Without this,
-- supabase-js typescript treats the params as non-null which breaks callers
-- that pass null for "all day" exceptions.
--
-- Recreate with DEFAULT NULL — semantics unchanged.

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
  IF v_coach_user_id IS NULL THEN
    RAISE EXCEPTION 'coach not found';
  END IF;

  IF NOT (is_admin(v_caller_user_id) OR v_caller_user_id = v_coach_user_id) THEN
    RAISE EXCEPTION 'unauthorized';
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
      INSERT INTO coach_availability_exceptions (coach_id, exception_date, start_time, end_time, reason)
      VALUES (p_coach_id, v_date, p_start_time, p_end_time, p_reason);
      v_inserted := v_inserted + 1;
    END IF;

    v_date := v_date + INTERVAL '1 day';
  END LOOP;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION add_coach_exception_range(uuid, date, date, time, time, text) TO authenticated;
