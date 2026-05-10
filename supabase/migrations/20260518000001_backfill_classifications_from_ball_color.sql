-- Plan 24 PR1 — backfill classifications from ball_color for any historical
-- player rows where the array is empty but ball_color is set. Idempotent;
-- only fills empty / null arrays.
--
-- Pre-flight (run in psql / Supabase SQL editor before migration):
--   SELECT ball_color, COUNT(*) FROM players
--    WHERE (classifications IS NULL OR cardinality(classifications) = 0)
--      AND ball_color IS NOT NULL
--    GROUP BY 1 ORDER BY 1;
--
-- 'competitive' rows are NOT backfilled (no direct classification mapping —
-- admin assigns advanced/elite by hand). Those rows surface in
-- /admin/players via the existing classifications-empty filter.

UPDATE players
   SET classifications = ARRAY[ball_color]
 WHERE (classifications IS NULL OR cardinality(classifications) = 0)
   AND ball_color IN ('blue', 'red', 'orange', 'green', 'yellow');

-- Strip any out-of-vocabulary classification values (e.g. legacy 'unknown'
-- entries) before we add the CHECK constraint. Empty arrays are valid;
-- admin sweeps them up via /admin/players.
UPDATE players
   SET classifications = ARRAY(
     SELECT c FROM unnest(classifications) AS c
     WHERE c = ANY(ARRAY['blue','red','orange','green','yellow','advanced','elite'])
   )
 WHERE classifications IS NOT NULL
   AND NOT (classifications <@ ARRAY['blue','red','orange','green','yellow','advanced','elite']::text[]);

-- Mirror the gender-normalize pattern: lock the array values via a CHECK
-- so future writes can't drift outside the known set. (Empty arrays are
-- still allowed — admin uses /admin/players "no classifications" surface
-- to sweep them up later.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_classifications_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_classifications_check
      CHECK (
        classifications IS NULL
        OR classifications <@ ARRAY['blue','red','orange','green','yellow','advanced','elite']::text[]
      );
  END IF;
END;
$$;
