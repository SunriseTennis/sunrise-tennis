-- ─────────────────────────────────────────────────────────────────────────
-- Add optional `school` column to players. Lets parents (and admin)
-- record which school the child attends — useful when a school program
-- (McAuley, Sporting Schools) seeds family/player rows, and when admin
-- needs to know who's at which school for at-school programming.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE players
  ADD COLUMN school text;

COMMENT ON COLUMN players.school IS
  'School the player attends. Optional, free-text. Set by admin or parent in player edit forms; populated by school-program imports (e.g. "McAuley Community School") so admin has the link at hand.';
