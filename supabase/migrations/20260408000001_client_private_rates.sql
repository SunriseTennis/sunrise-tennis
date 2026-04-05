-- Migration: Add client-facing private rates to coaches
-- The existing private_rate_cents is the coach PAY rate (what Maxim pays them).
-- client_private_rate_cents is what PARENTS pay for a private with that coach.
-- Maxim (owner): client rate = his hourly rate (all revenue is business revenue)
-- Zoe: client rate $80/hr (8000 cents)
-- George, Capri, Kylan: client rate $60/hr (6000 cents)
-- Test coaches: client rate $70/hr (7000 cents) for testing

-- ── Add client_private_rate_cents to hourly_rate JSONB ───────────────

UPDATE coaches SET hourly_rate = hourly_rate || jsonb_build_object(
  'client_private_rate_cents', (hourly_rate->>'private_rate_cents')::integer
) WHERE is_owner = true AND hourly_rate ? 'private_rate_cents';

UPDATE coaches SET hourly_rate = hourly_rate || jsonb_build_object(
  'client_private_rate_cents', 8000
) WHERE name ILIKE '%Zoe%';

UPDATE coaches SET hourly_rate = hourly_rate || jsonb_build_object(
  'client_private_rate_cents', 6000
) WHERE name ILIKE '%George%';

UPDATE coaches SET hourly_rate = hourly_rate || jsonb_build_object(
  'client_private_rate_cents', 6000
) WHERE name ILIKE '%Capri%';

UPDATE coaches SET hourly_rate = hourly_rate || jsonb_build_object(
  'client_private_rate_cents', 6000
) WHERE name ILIKE '%Kylan%';

-- Test coaches
UPDATE coaches SET hourly_rate = hourly_rate || jsonb_build_object(
  'client_private_rate_cents', 7000
) WHERE name ILIKE 'Test-%' AND hourly_rate ? 'private_rate_cents';

-- ── Update get_private_price to use client rate ──────────────────────

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
  -- Use client-facing rate if available, fall back to private_rate_cents
  SELECT COALESCE(
    (hourly_rate->>'client_private_rate_cents')::integer,
    (hourly_rate->>'private_rate_cents')::integer
  )
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
