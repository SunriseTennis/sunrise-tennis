-- Reorganise competitions: rename JSL → Friday Night, move Prems/A1 into it
-- JSL teams keep 5-player size + JSL deadline (2026-04-06)
-- Prems/A1 teams keep 4-player size, get G&WD deadline notes

BEGIN;

-- Rename Junior State League → Friday Night
UPDATE competitions
SET name        = 'Friday Night',
    short_name  = 'Fri Night',
    updated_at  = now()
WHERE id = 'a1000000-0000-0000-0000-000000000002';

-- Move Fri Prems Boys and Fri A1 Boys from G&WD → Friday Night
UPDATE teams
SET competition_id = 'a1000000-0000-0000-0000-000000000002'
WHERE id IN (
  'b1000000-0000-0000-0000-000000000014',  -- Fri Prems Boys
  'b1000000-0000-0000-0000-000000000015'   -- Fri A1 Boys
);

COMMIT;
