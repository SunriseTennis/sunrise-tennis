-- Private Booking Feature: Database Functions
-- Helper functions for pricing, coach pay, cancellation tracking, and term lookup.

-- ============================================================================
-- get_private_price: Calculate private lesson price for a coach + duration
-- Returns price in cents, pro-rated from hourly rate.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_private_price(
  target_coach_id uuid,
  target_duration_minutes integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  rate_cents integer;
BEGIN
  SELECT (hourly_rate->>'private_rate_cents')::integer
  INTO rate_cents
  FROM coaches
  WHERE id = target_coach_id;

  IF rate_cents IS NULL THEN
    RAISE EXCEPTION 'Coach not found or no private rate set';
  END IF;

  -- Pro-rate: (rate_cents * duration) / 60
  RETURN ROUND((rate_cents * target_duration_minutes)::numeric / 60);
END;
$$;

COMMENT ON FUNCTION get_private_price IS
  'Returns private lesson price in cents, pro-rated from coach hourly rate.';

-- ============================================================================
-- get_coach_pay: Calculate coach pay from a lesson price
-- Formula: 50% of ex-GST amount. GST = 10%, so ex-GST = price / 1.1
-- ============================================================================

CREATE OR REPLACE FUNCTION get_coach_pay(price_cents integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND((price_cents::numeric / 1.1) * 0.5)::integer;
$$;

COMMENT ON FUNCTION get_coach_pay IS
  'Returns coach pay: 50% of ex-GST price. E.g. $80 lesson -> ~$36.36 pay.';

-- ============================================================================
-- get_current_term: Returns current SA school term and year
-- Based on hardcoded SA term dates (same source as school-terms.ts)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_term()
RETURNS TABLE(term smallint, year smallint)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  today date := CURRENT_DATE;
BEGIN
  -- 2025 terms
  IF today BETWEEN '2025-01-28' AND '2025-04-11' THEN
    RETURN QUERY SELECT 1::smallint, 2025::smallint;
  ELSIF today BETWEEN '2025-04-28' AND '2025-07-04' THEN
    RETURN QUERY SELECT 2::smallint, 2025::smallint;
  ELSIF today BETWEEN '2025-07-21' AND '2025-09-26' THEN
    RETURN QUERY SELECT 3::smallint, 2025::smallint;
  ELSIF today BETWEEN '2025-10-13' AND '2025-12-12' THEN
    RETURN QUERY SELECT 4::smallint, 2025::smallint;
  -- 2026 terms
  ELSIF today BETWEEN '2026-01-27' AND '2026-04-10' THEN
    RETURN QUERY SELECT 1::smallint, 2026::smallint;
  ELSIF today BETWEEN '2026-04-27' AND '2026-07-03' THEN
    RETURN QUERY SELECT 2::smallint, 2026::smallint;
  ELSIF today BETWEEN '2026-07-20' AND '2026-09-25' THEN
    RETURN QUERY SELECT 3::smallint, 2026::smallint;
  ELSIF today BETWEEN '2026-10-12' AND '2026-12-11' THEN
    RETURN QUERY SELECT 4::smallint, 2026::smallint;
  ELSE
    -- Holiday period: return the next upcoming term
    -- During summer (after T4 or before T1): return T1 of next year
    IF today > '2025-12-12' AND today < '2026-01-27' THEN
      RETURN QUERY SELECT 1::smallint, 2026::smallint;
    ELSIF today > '2026-12-11' THEN
      RETURN QUERY SELECT 1::smallint, 2027::smallint;
    ELSE
      -- Between terms: return the upcoming term
      IF today > '2026-04-10' AND today < '2026-04-27' THEN
        RETURN QUERY SELECT 2::smallint, 2026::smallint;
      ELSIF today > '2026-07-03' AND today < '2026-07-20' THEN
        RETURN QUERY SELECT 3::smallint, 2026::smallint;
      ELSIF today > '2026-09-25' AND today < '2026-10-12' THEN
        RETURN QUERY SELECT 4::smallint, 2026::smallint;
      ELSIF today > '2025-04-11' AND today < '2025-04-28' THEN
        RETURN QUERY SELECT 2::smallint, 2025::smallint;
      ELSIF today > '2025-07-04' AND today < '2025-07-21' THEN
        RETURN QUERY SELECT 3::smallint, 2025::smallint;
      ELSIF today > '2025-09-26' AND today < '2025-10-13' THEN
        RETURN QUERY SELECT 4::smallint, 2025::smallint;
      ELSE
        -- Fallback
        RETURN QUERY SELECT 1::smallint, EXTRACT(YEAR FROM today)::smallint;
      END IF;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_current_term IS
  'Returns current SA school term {term, year}. During holidays, returns next upcoming term.';

-- ============================================================================
-- increment_cancellation_counter: Upsert cancellation tracker
-- counter_type: ''late_cancellation'' or ''noshow''
-- Returns the new count for that counter type.
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_cancellation_counter(
  target_family_id uuid,
  target_term smallint,
  target_year smallint,
  counter_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  IF counter_type NOT IN ('late_cancellation', 'noshow') THEN
    RAISE EXCEPTION 'Invalid counter_type: %', counter_type;
  END IF;

  IF counter_type = 'late_cancellation' THEN
    INSERT INTO cancellation_tracker (family_id, term, year, late_cancellation_count)
    VALUES (target_family_id, target_term, target_year, 1)
    ON CONFLICT (family_id, term, year) DO UPDATE
      SET late_cancellation_count = cancellation_tracker.late_cancellation_count + 1,
          updated_at = now()
    RETURNING late_cancellation_count INTO new_count;
  ELSE
    INSERT INTO cancellation_tracker (family_id, term, year, noshow_count)
    VALUES (target_family_id, target_term, target_year, 1)
    ON CONFLICT (family_id, term, year) DO UPDATE
      SET noshow_count = cancellation_tracker.noshow_count + 1,
          updated_at = now()
    RETURNING noshow_count INTO new_count;
  END IF;

  RETURN new_count;
END;
$$;

COMMENT ON FUNCTION increment_cancellation_counter IS
  'Upserts cancellation counter for a family/term. Returns new count after increment.';
