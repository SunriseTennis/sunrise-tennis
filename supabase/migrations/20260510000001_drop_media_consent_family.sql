-- Plan 20 — Drop media_consent_family per Maxim's call (05-May-2026).
--
-- The "family progress moments (private)" use case wasn't pulling
-- weight: parents had to think about a third toggle that mostly
-- duplicated the coaching one in their head. Two toggles cover the
-- same intent: coaching analysis (private internal) + social media
-- (public Sunrise platforms).
--
-- Order matters: the generated `media_consent` column depends on
-- `media_consent_family`, so drop the generated column first, drop
-- the family column, then recreate the generated column from the two
-- surviving booleans.
--
-- Pre-existing rows with media_consent_family=true and the others
-- false simply lose that one consent dimension. No backfill — that
-- matches "get rid of family progress moments completely" (per the
-- 05-May-2026 walkthrough).

ALTER TABLE players DROP COLUMN media_consent;
ALTER TABLE players DROP COLUMN media_consent_family;

ALTER TABLE players ADD COLUMN media_consent boolean
  GENERATED ALWAYS AS (
    media_consent_coaching OR media_consent_social
  ) STORED;

COMMENT ON COLUMN players.media_consent IS
  'Plan 20. GENERATED — true if either granular consent (coaching, social) is on. READ-ONLY; set the two media_consent_* columns instead.';
