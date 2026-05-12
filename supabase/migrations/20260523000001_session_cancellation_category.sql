-- Plan: admin overview calendar — inline session management + unified cancel
-- (`~/.claude/plans/delightful-nibbling-sparkle.md`, 12-May-2026)
--
-- Two additive changes:
--   1. `sessions.cancellation_category text NULL` with CHECK
--      ('rain_out' | 'heat_out' | 'other'). Lets admin pick a structured reason
--      when cancelling a session, and lets future /admin/reports views count
--      "this term: 5 rain-outs / 2 heat-outs / 3 other" off it. Backfilled
--      best-effort from existing free-text `cancellation_reason`.
--   2. `notification_rules.admin.session.cancelled` body template gains a
--      `{reasonLabel}` placeholder. The dispatcher caller
--      (cancelSession + cancelTodaySessions in admin/actions.ts) computes
--      reasonLabel server-side: 'rain_out' -> "rain", 'heat_out' -> "extreme
--      heat", 'other' -> the trimmed admin-typed reason text.
--
-- RLS unchanged — `sessions` writes are already admin-only.
-- Idempotent: ALTER ... ADD COLUMN uses IF NOT EXISTS; backfill is WHERE-gated;
-- notification_rules UPDATE is keyed on event_type + audience.

-- ── 1. Schema ──────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS cancellation_category text;

-- Add the CHECK separately so re-running on a DB that already has the column
-- doesn't fail. Drop-then-add the constraint to make the file idempotent.
ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_cancellation_category_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_cancellation_category_check
    CHECK (cancellation_category IS NULL
           OR cancellation_category IN ('rain_out','heat_out','other'));

COMMENT ON COLUMN sessions.cancellation_category IS
  'rain_out | heat_out | other. Nullable for non-cancelled sessions. '
  'Set alongside cancellation_reason by cancelSession() in admin/actions.ts.';

-- ── 2. Best-effort backfill for existing cancelled sessions ────────────────

UPDATE sessions
   SET cancellation_category = CASE
     WHEN cancellation_reason ILIKE '%rain%'   THEN 'rain_out'
     WHEN cancellation_reason ILIKE '%wet%'    THEN 'rain_out'
     WHEN cancellation_reason ILIKE '%storm%'  THEN 'rain_out'
     WHEN cancellation_reason ILIKE '%heat%'   THEN 'heat_out'
     WHEN cancellation_reason IS NOT NULL
      AND length(trim(cancellation_reason)) > 0 THEN 'other'
     ELSE NULL
   END
 WHERE status = 'cancelled'
   AND cancellation_category IS NULL;

-- ── 3. Update the admin.session.cancelled body template to render reason ────

UPDATE notification_rules
   SET body_template =
         '{programName} on {date} at {time} was cancelled due to {reasonLabel}. {creditNote}'
 WHERE event_type = 'admin.session.cancelled'
   AND audience    = 'family';
