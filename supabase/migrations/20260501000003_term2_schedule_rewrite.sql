-- Migration: Term 2 schedule rewrite
-- Updates Thursday squads with new times + prices + track_required.
-- Adds Thu Advanced Squad, Thu Morning Squad, Tue Morning Squad, Fri Blue Ball,
-- and splits Wed Orange/Green combined into separate Orange Girls + Green Girls.
-- Sets gender_restriction='female' on all Wed girls programs.

-- ── Thursday afternoon squads (existing programs, updated times + prices) ─────
-- Thu Red: 4:00-4:45 → 4:00-5:00, $20 → $25 (60min)
UPDATE programs
SET start_time = '16:00', end_time = '17:00', duration_min = 60,
    per_session_cents = 2500, term_fee_cents = NULL,
    track_required = 'performance',
    allowed_classifications = ARRAY['red']
WHERE slug = 'thu-red-squad';

-- Thu Orange: 4:45-5:30 → 4:30-5:30, $20 → $25 (60min)
UPDATE programs
SET start_time = '16:30', end_time = '17:30', duration_min = 60,
    per_session_cents = 2500, term_fee_cents = NULL,
    track_required = 'performance',
    allowed_classifications = ARRAY['orange']
WHERE slug = 'thu-orange-squad';

-- Thu Green: 5:30-6:15 → 5:00-6:15, $20 → $30 (75min)
UPDATE programs
SET start_time = '17:00', end_time = '18:15', duration_min = 75,
    per_session_cents = 3000, term_fee_cents = NULL,
    track_required = 'performance',
    allowed_classifications = ARRAY['green']
WHERE slug = 'thu-green-squad';

-- Thu Yellow: 6:15-7:15 → 5:30-7:00, $25 → $30 (90min)
UPDATE programs
SET start_time = '17:30', end_time = '19:00', duration_min = 90,
    per_session_cents = 3000, term_fee_cents = NULL,
    track_required = 'performance',
    allowed_classifications = ARRAY['yellow']
WHERE slug = 'thu-yellow-squad';

-- Thu Elite: 7:15-8:30 → 7:00-8:30, $0 → $30 (90min)
UPDATE programs
SET start_time = '19:00', end_time = '20:30', duration_min = 90,
    per_session_cents = 3000, term_fee_cents = NULL,
    track_required = 'performance',
    allowed_classifications = ARRAY['elite']
WHERE slug = 'thu-elite-squad';

-- ── Thu Advanced Squad (NEW) ───────────────────────────────────────────────────
INSERT INTO programs (
  name, slug, type, level, day_of_week,
  start_time, end_time, duration_min,
  per_session_cents, status, term,
  description,
  allowed_classifications, track_required
)
SELECT
  'Thu Advanced Squad', 'thu-advanced-squad', 'squad', 'advanced', 4,
  '18:15', '19:45', 90,
  3000, 'active', 'Term 2 2026',
  'Performance squad for advanced players (UTR 4.5+). Trains alongside Yellow squad 6:15-7 and Elite squad 7-7:45.',
  ARRAY['advanced'], 'performance'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'thu-advanced-squad');

-- ── Tue Morning Squad (NEW) ────────────────────────────────────────────────────
INSERT INTO programs (
  name, slug, type, level, day_of_week,
  start_time, end_time, duration_min,
  per_session_cents, status, term,
  description,
  allowed_classifications, track_required
)
SELECT
  'Tue Morning Squad', 'tue-morning-squad', 'squad', 'advanced', 2,
  '06:45', '08:00', 75,
  2500, 'active', 'Term 2 2026',
  'Pre-school morning squad for advanced and elite players. $25/session, $15/session if also enrolled in Thu Morning Squad.',
  ARRAY['advanced', 'elite'], 'performance'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'tue-morning-squad');

-- ── Thu Morning Squad (NEW) ────────────────────────────────────────────────────
INSERT INTO programs (
  name, slug, type, level, day_of_week,
  start_time, end_time, duration_min,
  per_session_cents, status, term,
  description,
  allowed_classifications, track_required
)
SELECT
  'Thu Morning Squad', 'thu-morning-squad', 'squad', 'advanced', 4,
  '06:45', '08:00', 75,
  2500, 'active', 'Term 2 2026',
  'Pre-school morning squad for advanced and elite players. $25/session, $15/session if also enrolled in Tue Morning Squad.',
  ARRAY['advanced', 'elite'], 'performance'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'thu-morning-squad');

-- ── Wednesday girls programs (gender-restricted) ──────────────────────────────
-- Wed Girls Red: 4:15-5:00 (unchanged time, set restriction)
UPDATE programs
SET start_time = '16:15', end_time = '17:00', duration_min = 45,
    per_session_cents = 2000, term_fee_cents = NULL,
    gender_restriction = 'female',
    allowed_classifications = ARRAY['red']
WHERE slug = 'wed-girls-red';

-- Wed Girls Orange/Green → Wed Girls Orange (renamed; new time 4:45-5:45 60min $25)
UPDATE programs
SET name = 'Wed Girls Orange',
    slug = 'wed-girls-orange',
    level = 'orange',
    start_time = '16:45', end_time = '17:45', duration_min = 60,
    per_session_cents = 2500, term_fee_cents = NULL,
    description = 'Girls only',
    gender_restriction = 'female',
    allowed_classifications = ARRAY['orange']
WHERE slug = 'wed-girls-orange-green';

-- Wed Girls Green (NEW)
INSERT INTO programs (
  name, slug, type, level, day_of_week,
  start_time, end_time, duration_min,
  per_session_cents, status, term,
  description,
  gender_restriction, allowed_classifications
)
SELECT
  'Wed Girls Green', 'wed-girls-green', 'group', 'green', 3,
  '17:15', '18:15', 60,
  2500, 'active', 'Term 2 2026',
  'Girls only',
  'female', ARRAY['green']
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'wed-girls-green');

-- Wed Girls Yellow: 5:45-6:45 (unchanged time, set restriction)
UPDATE programs
SET start_time = '17:45', end_time = '18:45', duration_min = 60,
    per_session_cents = 2500, term_fee_cents = NULL,
    gender_restriction = 'female',
    allowed_classifications = ARRAY['yellow']
WHERE slug = 'wed-girls-yellow';

-- Wed Yellow Ball (mixed): 6:45-7:45 (unchanged)
UPDATE programs
SET start_time = '18:45', end_time = '19:45', duration_min = 60,
    per_session_cents = 2500, term_fee_cents = NULL,
    allowed_classifications = ARRAY['yellow']
WHERE slug = 'wed-yellow-ball';

-- ── Fri Blue Ball (NEW) ────────────────────────────────────────────────────────
INSERT INTO programs (
  name, slug, type, level, day_of_week,
  start_time, end_time, duration_min,
  per_session_cents, status, term,
  description,
  allowed_classifications
)
SELECT
  'Fri Blue Ball', 'fri-blue-ball', 'group', 'blue', 5,
  '15:45', '16:15', 30,
  1500, 'active', 'Term 2 2026',
  'First steps for ages 3-5. Soft balls, fun games, coordination.',
  ARRAY['blue']
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'fri-blue-ball');

-- ── Term tagging: bump everything active to Term 2 2026 ───────────────────────
UPDATE programs SET term = 'Term 2 2026' WHERE status = 'active';
