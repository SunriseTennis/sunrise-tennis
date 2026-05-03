-- Coach: delivers_privates flag
--
-- When false, the coach's availability does not surface to parents on the
-- privates booking calendar. Used to onboard a coach for groups without
-- immediately offering them as a private option (e.g. ABN pending, or
-- they're an assistant who only does groups).
--
-- Default true = no behavioural change for existing coaches. New coaches
-- get false by default at the application layer (createCoach action) so
-- the admin opts them in deliberately.

ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS delivers_privates boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN coaches.delivers_privates IS
  'When false, coach''s availability does not surface to parents on the privates booking calendar. Used to onboard a coach for groups without immediately offering them as a private option.';
