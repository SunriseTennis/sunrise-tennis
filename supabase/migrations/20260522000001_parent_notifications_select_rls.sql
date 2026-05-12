-- ─────────────────────────────────────────────────────────────────────────
-- Bundled with Plan 25 — Parent SELECT policy on `notifications`.
--
-- Pre-existing bug: only `admin_notifications_select` existed on the
-- `notifications` table. Parent + coach JWTs reading
--
--   from('notification_recipients').select('id, ..., notifications:notification_id(title, body, url, type)')
--
-- in /parent/notifications and the notification-bell would get null back
-- for the joined `notifications` row, because RLS silently filtered the
-- inaccessible join target. Result: in-app feed rows render with blank
-- title + blank body. Bit Maxim 12-May-2026 when testing as S002 (true
-- parent, no admin role overlay).
--
-- Fix: a row in `notifications` is readable if the caller has a
-- corresponding `notification_recipients` row for it. Safe because:
--   - notification_recipients already has `own_notification_recipients_select`
--     gated on `user_id = auth.uid()`, so the EXISTS lookup itself is
--     a single-row index probe.
--   - The reverse direction (notification_recipients → notifications)
--     is not recursive — notification_recipients' policies don't reference
--     notifications, so no RLS-recursion trap.
--   - `notifications.UNIQUE(notification_id, user_id)` on the recipients
--     table backs an implicit index that keeps the EXISTS cheap.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "recipient_notifications_select" ON notifications;
CREATE POLICY "recipient_notifications_select" ON notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notification_recipients nr
      WHERE nr.notification_id = notifications.id
        AND nr.user_id = auth.uid()
    )
  );
