-- Migration: Player classifications + performance/participation track
-- Adds an array of skill classifications (blue/red/orange/green/yellow/advanced/elite)
-- and a track ('performance' | 'participation') used by Thursday squad eligibility.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS classifications text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS track text DEFAULT 'participation';

-- Backfill: every existing active player gets their current ball_color as their
-- single classification. Track defaults to participation; admin upgrades manually.
UPDATE players
SET classifications = CASE
                        WHEN ball_color IS NOT NULL AND ball_color <> ''
                          THEN ARRAY[ball_color]
                        ELSE ARRAY[]::text[]
                      END
WHERE (classifications IS NULL OR classifications = ARRAY[]::text[]);

UPDATE players SET track = 'participation' WHERE track IS NULL;

-- Add a check constraint to keep track values consistent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'players_track_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_track_check
      CHECK (track IN ('performance', 'participation'));
  END IF;
END $$;
