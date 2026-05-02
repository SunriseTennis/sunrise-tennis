-- Per-coach grandfathered private rate overrides.
--
-- Resolution order for a private price:
--   1. family_pricing row with (family_id, coach_id, program_type='private') — grandfathered rate
--   2. family_pricing row with (family_id, coach_id IS NULL, program_type='private') — broad family override
--   3. coaches.hourly_rate.client_private_rate_cents — coach default
--
-- per_session_cents on a private override is interpreted as **per 30 min**
-- and pro-rated by duration (so $40/30min becomes $80/60min).

ALTER TABLE family_pricing ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES coaches(id);

CREATE INDEX IF NOT EXISTS idx_family_pricing_lookup_private
  ON family_pricing(family_id, coach_id, program_type)
  WHERE program_type = 'private';

-- ── Replace get_private_price with family-aware version ────────────────
--
-- Old signature was (target_coach_id, target_duration_minutes). New one
-- accepts target_family_id as the first arg. We DROP the old function so
-- callers must update; the codebase ships a coordinated change.

DROP FUNCTION IF EXISTS get_private_price(uuid, integer);

CREATE OR REPLACE FUNCTION get_private_price(
  target_family_id uuid,
  target_coach_id uuid,
  target_duration_minutes integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rate_cents integer;
  override_per_30 integer;
BEGIN
  -- Auth gate: admin OR a parent of the named family.
  IF NOT (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role = 'parent'
        AND family_id = target_family_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to price for this family';
  END IF;

  -- 1. Grandfathered (family + specific coach)
  SELECT per_session_cents INTO override_per_30
  FROM family_pricing
  WHERE family_id = target_family_id
    AND coach_id = target_coach_id
    AND program_type = 'private'
    AND per_session_cents IS NOT NULL
    AND valid_from <= CURRENT_DATE
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  ORDER BY valid_from DESC
  LIMIT 1;

  IF override_per_30 IS NOT NULL THEN
    RETURN ROUND((override_per_30 * target_duration_minutes)::numeric / 30);
  END IF;

  -- 2. Broad family override (all privates)
  SELECT per_session_cents INTO override_per_30
  FROM family_pricing
  WHERE family_id = target_family_id
    AND coach_id IS NULL
    AND program_type = 'private'
    AND per_session_cents IS NOT NULL
    AND valid_from <= CURRENT_DATE
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  ORDER BY valid_from DESC
  LIMIT 1;

  IF override_per_30 IS NOT NULL THEN
    RETURN ROUND((override_per_30 * target_duration_minutes)::numeric / 30);
  END IF;

  -- 3. Coach default (per hour, pro-rated by /60)
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

  RETURN ROUND((rate_cents * target_duration_minutes)::numeric / 60);
END;
$$;

-- ── Helper: get the non-overridden default rate for a coach ─────────────
-- Used by the parent UI to render the strikethrough "(was $X)" hint
-- without leaking other families' overrides. Returns hourly cents.

CREATE OR REPLACE FUNCTION get_private_default_rate(target_coach_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (hourly_rate->>'client_private_rate_cents')::integer,
    (hourly_rate->>'private_rate_cents')::integer
  )
  FROM coaches
  WHERE id = target_coach_id;
$$;

-- ── Resolver for the parent UI: returns the family's effective rate +
-- the default rate + the override's valid_until (so the UI can render
-- "$40 ~~$50~~ until <Term>"). All in one round trip.

CREATE OR REPLACE FUNCTION get_private_rate_for_family(
  target_family_id uuid,
  target_coach_id uuid
)
RETURNS TABLE (
  per_30_cents integer,
  default_per_hour_cents integer,
  is_override boolean,
  valid_until date,
  override_source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_rate integer;
  override_per_30 integer;
  override_until date;
  override_src text;
BEGIN
  -- Auth gate: admin OR parent of the family
  IF NOT (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role = 'parent'
        AND family_id = target_family_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  default_rate := get_private_default_rate(target_coach_id);

  -- 1. Grandfathered
  SELECT per_session_cents, valid_until INTO override_per_30, override_until
  FROM family_pricing
  WHERE family_id = target_family_id
    AND coach_id = target_coach_id
    AND program_type = 'private'
    AND per_session_cents IS NOT NULL
    AND valid_from <= CURRENT_DATE
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  ORDER BY valid_from DESC
  LIMIT 1;

  IF override_per_30 IS NOT NULL THEN
    override_src := 'family_coach';
    RETURN QUERY SELECT override_per_30, default_rate, true, override_until, override_src;
    RETURN;
  END IF;

  -- 2. Broad family override
  SELECT per_session_cents, valid_until INTO override_per_30, override_until
  FROM family_pricing
  WHERE family_id = target_family_id
    AND coach_id IS NULL
    AND program_type = 'private'
    AND per_session_cents IS NOT NULL
    AND valid_from <= CURRENT_DATE
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  ORDER BY valid_from DESC
  LIMIT 1;

  IF override_per_30 IS NOT NULL THEN
    override_src := 'family_all_private';
    RETURN QUERY SELECT override_per_30, default_rate, true, override_until, override_src;
    RETURN;
  END IF;

  -- 3. Default — derive per-30 from per-hour for consistent return shape
  RETURN QUERY SELECT (default_rate / 2)::integer, default_rate, false, NULL::date, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION get_private_price(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_private_default_rate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_private_rate_for_family(uuid, uuid) TO authenticated;
