-- Add `email` to the channels for the admin.session.cancelled rule so that
-- the dispatcher fans the rendered notification over Resend in addition to
-- push + in_app. Per-user opt-out (Plan 22 Phase 2) gates email per-recipient
-- via `user_notification_preferences.schedule.email`.
--
-- The body template still uses the {creditNote} placeholder — the caller
-- (cancelSession in admin/actions.ts) computes a per-family creditNote
-- describing the financial side-effect ("A credit has been added..." or
-- "We've removed the upcoming charge..." or "Your account has been
-- adjusted accordingly.").
--
-- Idempotent: re-applying flips channels to the same value.

UPDATE notification_rules
   SET channels = jsonb_build_array('push', 'in_app', 'email')
 WHERE event_type = 'admin.session.cancelled'
   AND audience = 'family';
