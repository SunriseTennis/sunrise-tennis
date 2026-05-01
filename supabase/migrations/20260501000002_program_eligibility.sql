-- Migration: Program eligibility + tier-2 early bird columns
-- - allowed_classifications: which player classifications can enroll
-- - gender_restriction: limit enrollment to a single gender (e.g. 'female' for Wed girls)
-- - track_required: 'performance' for Thursday squads + morning squads; NULL for everyone
-- - early_pay_discount_pct_tier2 + early_bird_deadline_tier2: second-tier early-bird

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS allowed_classifications text[],
  ADD COLUMN IF NOT EXISTS gender_restriction text,
  ADD COLUMN IF NOT EXISTS track_required text,
  ADD COLUMN IF NOT EXISTS early_pay_discount_pct_tier2 integer,
  ADD COLUMN IF NOT EXISTS early_bird_deadline_tier2 date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programs_gender_restriction_check'
  ) THEN
    ALTER TABLE programs
      ADD CONSTRAINT programs_gender_restriction_check
      CHECK (gender_restriction IS NULL OR gender_restriction IN ('male', 'female'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programs_track_required_check'
  ) THEN
    ALTER TABLE programs
      ADD CONSTRAINT programs_track_required_check
      CHECK (track_required IS NULL OR track_required IN ('performance', 'participation'));
  END IF;
END $$;

-- Backfill allowed_classifications from level for existing programs that don't
-- already have a value. Composite levels like 'orange-green' split into both.
UPDATE programs
SET allowed_classifications = CASE
  WHEN level = 'orange-green' THEN ARRAY['orange', 'green']
  WHEN level = 'red-orange'   THEN ARRAY['red', 'orange']
  WHEN level IN ('blue', 'red', 'orange', 'green', 'yellow', 'elite', 'advanced') THEN ARRAY[level]
  WHEN level = 'competitive' THEN ARRAY['advanced', 'elite']
  ELSE ARRAY[]::text[]
END
WHERE allowed_classifications IS NULL;
