-- Plan 22 Phase 1.2 — Per-user notification preferences.
--
-- One row per auth.users id. JSONB shape:
--   { "email": {"booking": true, "reminder": false, ...},
--     "push":  {"booking": true, ...},
--     "in_app":{"booking": true, ...} }
-- Missing channel/category combos fall back to category defaults defined in
-- src/lib/notifications/preferences.ts. So no row at all = every notification
-- on (matches today's behaviour for users who haven't visited settings).
--
-- Why per-user not per-family: push subs are per-user (per-device); email
-- goes to each parent's auth email; in-app is per-user via notification_recipients.
-- See Plan 22 Apps/Plans/22-notification-opt-out.md for the full design.

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_notification_preferences IS
  'Per-user × channel × category opt-out matrix. See Plan 22.';
COMMENT ON COLUMN user_notification_preferences.prefs IS
  'JSONB { channel: { category: bool } }. Missing keys fall back to category defaults in src/lib/notifications/preferences.ts.';

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Each user reads + writes only their own row.
DROP POLICY IF EXISTS user_notification_preferences_self ON user_notification_preferences;
CREATE POLICY user_notification_preferences_self ON user_notification_preferences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin can read for support / opt-out audit.
DROP POLICY IF EXISTS user_notification_preferences_admin_read ON user_notification_preferences;
CREATE POLICY user_notification_preferences_admin_read ON user_notification_preferences
  FOR SELECT USING (is_admin(auth.uid()));

-- updated_at trigger (mirrors notification_rules pattern).
CREATE OR REPLACE FUNCTION user_notification_preferences_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_notification_preferences_set_updated_at ON user_notification_preferences;
CREATE TRIGGER user_notification_preferences_set_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION user_notification_preferences_touch_updated_at();
