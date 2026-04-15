-- Migration: Pre-charge heads-up notification preference
-- Adds `pre_charge_heads_up` key to families.notification_preferences JSONB.
-- Cron at /api/cron/pre-charge-notifications checks this flag before sending.

-- Backfill existing rows: add the key if missing, default true.
UPDATE families
SET notification_preferences = coalesce(notification_preferences, '{}'::jsonb)
  || jsonb_build_object(
    'pre_charge_heads_up',
    coalesce(notification_preferences->'pre_charge_heads_up', 'true'::jsonb)
  );

-- Update default for new rows to include the key.
ALTER TABLE families
  ALTER COLUMN notification_preferences
  SET DEFAULT '{"session_reminders": "first_week_and_privates", "pre_charge_heads_up": true}'::jsonb;

COMMENT ON COLUMN families.notification_preferences IS
  'JSONB notification settings. Keys: session_reminders (all|first_week_and_privates|privates_only|off), pre_charge_heads_up (bool — push + in-platform heads-up 10 days before a charge posts).';
