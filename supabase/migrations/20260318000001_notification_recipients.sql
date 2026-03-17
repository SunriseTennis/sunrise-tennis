-- Migration 015: Notification recipients tracking + url column
-- Tracks which users received each notification and read status

-- Add url column to notifications for deep-linking
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS url text;

-- Track individual notification delivery per user
CREATE TABLE notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

-- Admin can see all
CREATE POLICY "admin_notification_recipients_select" ON notification_recipients FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "admin_notification_recipients_insert" ON notification_recipients FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Users can see their own
CREATE POLICY "own_notification_recipients_select" ON notification_recipients FOR SELECT
  USING (user_id = auth.uid());

-- Users can mark their own as read
CREATE POLICY "own_notification_recipients_update" ON notification_recipients FOR UPDATE
  USING (user_id = auth.uid());

-- Service role inserts (for server actions creating recipients on behalf of system)
-- Handled via service role client, no RLS policy needed

-- Add unique constraint on push_subscriptions(user_id, endpoint) for dedup
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_idx
  ON push_subscriptions(user_id, endpoint);
