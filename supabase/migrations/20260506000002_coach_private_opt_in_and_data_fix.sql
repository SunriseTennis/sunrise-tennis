-- Plan 16 follow-up — per-coach opt-in flag for privates + Maxim data fix.
--
-- New attribute: coaches.private_opt_in_required boolean.
-- When true: parents only see this coach as a private option for players with
--            an explicit row in player_allowed_coaches.
-- When false (default): existing behaviour — empty allowlist for a player =
--            open access (any active delivers_privates coach is bookable).
--
-- Maxim (the owner) is flipped to opt-in-only. Existing player_allowed_coaches
-- rows for Maxim are deleted, EXCEPT for Vicktorya Delavault's family who
-- currently has a private booked in with him.

ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS private_opt_in_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN coaches.private_opt_in_required IS
  'When true, parents only see this coach as a private option for players with '
  'an explicit player_allowed_coaches row. Default false = open access when the '
  'player has no allowlist; restricted-by-allowlist when they do.';

-- Mark Maxim (the sole owner) as opt-in-only from now on.
UPDATE coaches SET private_opt_in_required = true WHERE is_owner = true;

-- ── Data fix: prune Maxim from existing allowlists, keep Delavault family ──

DO $$
DECLARE
  v_owner_coach_id      uuid;
  v_delavault_family_id uuid;
  v_family_count        integer;
  v_family_name_match   text;
  v_kept                integer;
  v_deleted             integer;
BEGIN
  SELECT id INTO v_owner_coach_id
    FROM coaches WHERE is_owner = true LIMIT 1;
  IF v_owner_coach_id IS NULL THEN
    RAISE EXCEPTION 'Owner coach not found — abort';
  END IF;

  -- Locate Vicktorya Delavault's family. Match on the surname; require uniqueness.
  SELECT count(*), max(family_name) INTO v_family_count, v_family_name_match
    FROM families
   WHERE family_name ILIKE '%delava%' AND status = 'active';

  IF v_family_count = 0 THEN
    RAISE EXCEPTION 'No active family matching Delavault - confirm spelling/status before applying';
  ELSIF v_family_count > 1 THEN
    RAISE EXCEPTION 'Multiple active families match delava (count=%) - narrow the match', v_family_count;
  END IF;

  SELECT id INTO v_delavault_family_id
    FROM families
   WHERE family_name ILIKE '%delava%' AND status = 'active'
   LIMIT 1;

  -- Ensure each active Delavault player has an explicit auto-approved allow row
  -- for Maxim. UPSERT keeps existing rows (and refreshes auto_approve to true).
  WITH ins AS (
    INSERT INTO player_allowed_coaches (player_id, coach_id, auto_approve)
    SELECT p.id, v_owner_coach_id, true
      FROM players p
     WHERE p.family_id = v_delavault_family_id
       AND p.status = 'active'
    ON CONFLICT (player_id, coach_id)
      DO UPDATE SET auto_approve = EXCLUDED.auto_approve
    RETURNING 1
  )
  SELECT count(*) INTO v_kept FROM ins;

  -- Delete Maxim from everyone else's allowlist.
  WITH del AS (
    DELETE FROM player_allowed_coaches
     WHERE coach_id = v_owner_coach_id
       AND player_id NOT IN (
         SELECT id FROM players WHERE family_id = v_delavault_family_id
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RAISE NOTICE
    'Maxim opt-in only: kept family "%" with % allow row(s); deleted % other row(s).',
    v_family_name_match, v_kept, v_deleted;
END $$;
