-- Plan 22 Phase 4.4 — Per-channel push body override.
--
-- Push notifications are clipped by iOS/Android around 70-90 characters. The
-- `admin.program.enrolled` body lands at ~110 chars when the {earlyBirdReminder}
-- placeholder fires. Splitting the early-bird text out of push (it lives well
-- in email + in-app) keeps push tight without losing context elsewhere.
--
-- Shape: nullable text column `body_template_push`. When set, the dispatcher
-- uses it for the push channel ONLY; in_app + email continue to use
-- `body_template`. When NULL, the dispatcher falls back to `body_template` for
-- push (current behaviour). This is fully backwards-compatible: every existing
-- rule keeps working unchanged until its row is updated.

ALTER TABLE notification_rules
  ADD COLUMN IF NOT EXISTS body_template_push text;

COMMENT ON COLUMN notification_rules.body_template_push IS
  'Optional push-only body. When set, the dispatcher uses this for the push channel; in_app and email keep using body_template. Reserved for rules whose unified body exceeds the ~80-char push truncation budget. See Plan 22 Phase 4.4.';

-- ─── Backfill: shorten admin.program.enrolled push body ──────────────────────
--
-- Email + in-app keep the full body with {earlyBirdReminder} so parents see
-- the deadline reminder when they tap into the platform. Push gets the short
-- shape below — readable in full inside the iOS/Android notification banner.
UPDATE notification_rules
   SET body_template_push = '{playerName} enrolled in {programName}'
 WHERE event_type = 'admin.program.enrolled'
   AND audience   = 'family';
