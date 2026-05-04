-- ─────────────────────────────────────────────────────────────────────────
-- Plan 17 Block A — split monolithic players.media_consent into three
-- granular booleans:
--   • coaching → photos/videos for internal technique analysis only
--   • family   → photos/videos shared privately with the player's family
--   • social   → public posts to Sunrise Tennis Instagram & Facebook
--
-- Old column re-added as a GENERATED column (true if any granular flag
-- is on). Reads keep working; writers MUST set the granular columns and
-- will throw if they try to UPDATE the generated `media_consent`.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Three new columns, default false (opt-in).
ALTER TABLE players
  ADD COLUMN media_consent_coaching boolean NOT NULL DEFAULT false,
  ADD COLUMN media_consent_family   boolean NOT NULL DEFAULT false,
  ADD COLUMN media_consent_social   boolean NOT NULL DEFAULT false;

-- 2. Backfill from the bundled boolean. Pre-split copy framed all three
--    uses as one toggle, so true → all three; false → none.
UPDATE players SET
  media_consent_coaching = COALESCE(media_consent, false),
  media_consent_family   = COALESCE(media_consent, false),
  media_consent_social   = COALESCE(media_consent, false);

-- 3. Drop the old column. Writers updated in the same commit.
ALTER TABLE players DROP COLUMN media_consent;

-- 4. Re-add as a generated column for back-compat reads. Cannot be
--    written to — UPDATE attempts throw, which is the safety net for
--    finding stragglers.
ALTER TABLE players ADD COLUMN media_consent boolean
  GENERATED ALWAYS AS (
    media_consent_coaching OR media_consent_family OR media_consent_social
  ) STORED;

COMMENT ON COLUMN players.media_consent_coaching IS
  'Plan 17 Block A. Photos/videos for coaching technique analysis (internal use only).';
COMMENT ON COLUMN players.media_consent_family IS
  'Plan 17 Block A. Photos/videos shared privately with the player''s family (e.g. progress moments).';
COMMENT ON COLUMN players.media_consent_social IS
  'Plan 17 Block A. Photos/videos posted publicly to Sunrise Tennis Instagram & Facebook with the child recognisable.';
COMMENT ON COLUMN players.media_consent IS
  'Plan 17 Block A. GENERATED — true if any granular consent is on. READ-ONLY; set the three media_consent_* columns instead.';
