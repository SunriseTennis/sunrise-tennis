-- Coach notification preferences
-- Adds a JSONB column on coaches mirroring families.notification_preferences.
-- Categories handled by the platform today:
--   booking_requests        — push when a parent requests a private with this coach
--   daily_session_digest    — morning push summarising today's sessions
--   late_cancellations      — push when a session is cancelled inside the cutoff window

ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN coaches.notification_preferences IS
  'Per-coach push notification toggles. Keys: booking_requests, daily_session_digest, late_cancellations.';
