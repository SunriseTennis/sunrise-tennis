-- Plan 22 Phase 1.1 — Categorize notification rules.
--
-- Adds `category` and `is_mandatory` columns to `notification_rules` so the
-- dispatcher can gate channel sends per-user-per-category, with mandatory
-- categories (security, account) bypassing the gate entirely.
--
-- Backfill per the mapping in Apps/Plans/22-notification-opt-out.md. Idempotent
-- — every UPDATE is keyed on (event_type, audience) which is the table's UNIQUE
-- constraint, so re-running this migration is safe.

ALTER TABLE notification_rules
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'booking',
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN notification_rules.category IS
  'Notification category. One of: security, account, booking, schedule, reminder, availability, admin, coach, marketing. Drives per-user opt-out granularity. See Plan 22.';
COMMENT ON COLUMN notification_rules.is_mandatory IS
  'When true, the dispatcher bypasses the per-user opt-out gate for this rule. Reserved for security + account-state rules. See Plan 22.';

CREATE INDEX IF NOT EXISTS notification_rules_category_idx
  ON notification_rules (category) WHERE enabled;

-- ─── Backfill ─────────────────────────────────────────────────────────────
-- Account state — mandatory, parent must always know.
UPDATE notification_rules SET category = 'account', is_mandatory = true
  WHERE event_type IN ('family.account_linked', 'family.approval.granted',
                       'family.approval.changes_requested', 'family.approval.rejected');

-- Booking confirmations (parent-facing).
UPDATE notification_rules SET category = 'booking', is_mandatory = false
  WHERE (event_type, audience) IN (
    ('admin.program.enrolled',  'family'),
    ('coach.private.confirmed', 'family')
  );

-- Schedule changes (parent-facing).
UPDATE notification_rules SET category = 'schedule', is_mandatory = false
  WHERE (event_type, audience) IN (
    ('admin.session.cancelled',         'family'),
    ('admin.session.rained_out',        'family'),
    ('admin.shared_private.converted',  'family'),
    ('coach.private.declined',          'family'),
    ('parent.private.partner_cancelled','family')
  );

-- Reminders (parent-facing).
UPDATE notification_rules SET category = 'reminder', is_mandatory = false
  WHERE (event_type, audience) IN (
    ('admin.charge.upcoming', 'family')
  );

-- Slot availability (parent-facing, eligible families).
UPDATE notification_rules SET category = 'availability', is_mandatory = false
  WHERE (event_type, audience) IN (
    ('parent.standing_slot.freed', 'eligible_families')
  );

-- Admin-side rules (Maxim's ops alerts).
UPDATE notification_rules SET category = 'admin', is_mandatory = false
  WHERE audience = 'admins';

-- Coach-side rules (operational, coach-facing).
UPDATE notification_rules SET category = 'coach', is_mandatory = false
  WHERE audience = 'coach';

-- ─── Sanity check ─────────────────────────────────────────────────────────
-- Surface any rules that didn't get a non-default category, so future seeds
-- have to opt into a category explicitly. We can't enforce a CHECK because
-- new rules need to be insertable before backfill — but the index above is
-- partial on `enabled`, so a misconfigured row stays out of the hot path.
DO $$
DECLARE
  uncategorized_count int;
BEGIN
  SELECT COUNT(*) INTO uncategorized_count
  FROM notification_rules
  WHERE category = 'booking'  -- the default; legitimate booking rules + any unhandled rules
    AND (event_type, audience) NOT IN (
      ('admin.program.enrolled',  'family'),
      ('coach.private.confirmed', 'family')
    );
  IF uncategorized_count > 0 THEN
    RAISE NOTICE 'Plan 22: % notification_rules row(s) have category=booking but were not in the backfill list. Audit before next deploy.', uncategorized_count;
  END IF;
END $$;
