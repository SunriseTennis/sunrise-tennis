-- ─────────────────────────────────────────────────────────────────────────
-- Plan 25 — Notification outbox (quiet-hours deferred delivery).
--
-- Push/email notifications routed via `dispatchNotification` that target a
-- parent or coach audience (`family`, `coach`, `eligible_families`) are
-- enqueued here when fired outside Adelaide-local 09:00–21:00, instead of
-- sending immediately. A daily cron at /api/cron/dispatch-queued-notifications
-- flushes due rows.
--
-- In-app feed rows still write immediately to `notifications` regardless of
-- the hour — those are passive, only surfaced when the recipient next opens
-- the app, so deferring them adds nothing.
--
-- Admins are never enqueued — `admins`-audience rules always send immediately
-- so Maxim is never out-of-loop on real-time business events.
--
-- See Apps/Plans/25-quiet-hours-deferred-delivery.md.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel       text NOT NULL CHECK (channel IN ('push', 'email')),

  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  url           text,

  /** Rule that fired the notification. SET NULL on rule deletion so the
      queued send still flushes (we already rendered the title/body). */
  rule_id       uuid REFERENCES notification_rules(id) ON DELETE SET NULL,
  event_type    text NOT NULL,
  /** Plan 22 opt-out category — needed at flush time to render the
      unsubscribe footer / List-Unsubscribe headers on email. */
  category      text NOT NULL,
  /** 'family' | 'coach' | 'eligible_families'. Recorded for observability;
      not used in the flush path. */
  audience      text NOT NULL,

  deliver_after timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'sent', 'failed', 'cancelled')),
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

-- Partial index — the cron's hot path is "give me all queued rows due now".
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON notification_outbox (deliver_after)
  WHERE status = 'queued';

-- Recent-rows lookup for any future admin observability tile.
CREATE INDEX IF NOT EXISTS notification_outbox_user_recent_idx
  ON notification_outbox (user_id, created_at DESC);

-- Retention sweep helper — cron deletes `sent` rows older than 30 days on
-- each tick; this index keeps that DELETE cheap.
CREATE INDEX IF NOT EXISTS notification_outbox_sent_retention_idx
  ON notification_outbox (sent_at)
  WHERE status = 'sent';

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

-- Admin-only read. Service-role (dispatcher + cron) bypasses RLS entirely.
DROP POLICY IF EXISTS notification_outbox_admin_select ON notification_outbox;
CREATE POLICY notification_outbox_admin_select ON notification_outbox
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policy for authenticated — only service-role writes.

COMMENT ON TABLE notification_outbox IS
  'Plan 25 — push/email sends deferred during Adelaide quiet hours (21:00–09:00). '
  'In-app feed rows still write immediately to `notifications`. Cron at '
  '/api/cron/dispatch-queued-notifications (daily, `30 23 * * *` UTC) flushes due rows.';
