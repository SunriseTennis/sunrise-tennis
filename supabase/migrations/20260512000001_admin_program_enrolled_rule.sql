-- Notification rule fired when admin enrols a player on behalf of a family.
--
-- Distinct event from `parent.program.enrolled` so admin can toggle independently
-- and the body template carries an early-bird reminder when the discount window
-- is still open (empty string when expired — leading-space convention like
-- {ballColorSuffix}).
--
-- The {earlyBirdReminder} placeholder is computed by the caller (bulkEnrolPlayers
-- in admin/actions.ts) using getActiveEarlyBird() against the program's tier 1/2
-- deadlines.

INSERT INTO notification_rules (
  event_type,
  audience,
  channels,
  title_template,
  body_template,
  url_template,
  description
) VALUES (
  'admin.program.enrolled',
  'family',
  '["push","in_app","email"]'::jsonb,
  'Booking Confirmed',
  '{playerName} has been enrolled in {programName}.{earlyBirdReminder}',
  '/parent/programs/{programId}',
  'Fires when admin enrols a player via /admin/programs/[id]. Body carries an early-bird reminder when the discount window is still open.'
)
ON CONFLICT (event_type, audience) DO UPDATE
SET channels       = EXCLUDED.channels,
    title_template = EXCLUDED.title_template,
    body_template  = EXCLUDED.body_template,
    url_template   = EXCLUDED.url_template,
    description    = EXCLUDED.description,
    enabled        = TRUE,
    updated_at     = now();
