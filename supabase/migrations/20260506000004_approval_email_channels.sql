-- ─────────────────────────────────────────────────────────────────────────
-- Plan 17 Block D — Wire email channel for approval-flow notifications
-- now that the dispatcher actually sends email (Resend REST API).
--
-- 1. Improve the family.approval.granted body so the email reads well.
-- 2. Add 'email' to the channel set for the four approval-flow rules.
-- 3. Add families.welcome_banner_dismissed_at for the JustApprovedBanner
--    "you're in" UX on /parent.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Re-seed the approval-granted rule body so the email subject + body
--    feel like an actual welcome (one short sentence wasn't enough).
UPDATE notification_rules
   SET title_template = 'You''re in — welcome to Sunrise Tennis',
       body_template = 'Your family''s account has been approved. You can now book group programs and private lessons, view payments, and stay in the loop with rain cancellations.

What''s next:
• Browse our programs and pick one that fits your child.
• Or book a private lesson with Maxim, Zoe or George.
• Add or update player details any time in Settings.

We''re glad you''re here.',
       url_template = '/parent'
 WHERE event_type = 'family.approval.granted';

-- 2. Turn on the email channel for the four approval-related rules.
UPDATE notification_rules
   SET channels = '["push","in_app","email"]'::jsonb
 WHERE event_type IN (
   'family.approval.granted',
   'family.approval.changes_requested',
   'family.approval.rejected'
 );

-- Also enable email for parent.signup.submitted → admins so Maxim gets
-- a paper trail outside the app.
UPDATE notification_rules
   SET channels = '["push","in_app","email"]'::jsonb
 WHERE event_type = 'parent.signup.submitted';

-- 3. Welcome-banner dismissal column. NULL = never dismissed; the page
--    shows JustApprovedBanner if approval_status='approved' AND
--    approved_at within the last 14 days AND this column is NULL.
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS welcome_banner_dismissed_at timestamptz;

COMMENT ON COLUMN families.welcome_banner_dismissed_at IS
  'Plan 17 — when the parent dismissed the post-approval welcome banner. NULL = never dismissed; show banner if approved within last 14 days.';
