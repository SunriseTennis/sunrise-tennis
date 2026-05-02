-- Rename "Thu Morning Squad" to "Wed Morning Squad" (slug + name + day + description).
-- The user-facing change happened in the admin UI before this migration was written;
-- this just makes a fresh deploy from migrations land in the same end state.
--
-- Idempotent. Safe to re-run.

-- 1. Rename any existing Thu Morning Squad row to Wed
UPDATE programs
SET
  slug = 'wed-morning-squad',
  name = 'Wed Morning Squad',
  day_of_week = 3,
  description = 'Pre-school morning squad for advanced and elite players. $25/session, $15/session if also enrolled in Tue Morning Squad.'
WHERE slug = 'thu-morning-squad';

-- 2. If neither slug exists yet (clean DB never ran the old seed migration), insert Wed directly
INSERT INTO programs (
  name, slug, type, level, day_of_week,
  start_time, end_time, duration_min,
  per_session_cents, status, term,
  description,
  allowed_classifications, track_required
)
SELECT
  'Wed Morning Squad', 'wed-morning-squad', 'squad', 'advanced', 3,
  '06:45', '08:00', 75,
  2500, 'active', 'Term 2 2026',
  'Pre-school morning squad for advanced and elite players. $25/session, $15/session if also enrolled in Tue Morning Squad.',
  ARRAY['advanced', 'elite'], 'performance'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'wed-morning-squad');

-- 3. Update Tue Morning Squad description to reference Wed (not Thu)
UPDATE programs
SET description = 'Pre-school morning squad for advanced and elite players. $25/session, $15/session if also enrolled in Wed Morning Squad.'
WHERE slug = 'tue-morning-squad'
  AND description LIKE '%Thu Morning Squad%';
