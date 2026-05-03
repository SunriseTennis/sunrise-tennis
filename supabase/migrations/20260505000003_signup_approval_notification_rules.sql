-- ─────────────────────────────────────────────────────────────────────────
-- Plan 15 Phase B — Notification rules for the approval flow.
--
-- Rules use 'in_app' + 'push' today; 'email' will activate once Resend
-- is wired (Phase A). Templates use {placeholder} syntax — see
-- src/lib/notifications/dispatch.ts for the rendering rules.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO notification_rules (event_type, audience, channels, title_template, body_template, url_template, description) VALUES
  ('parent.signup.submitted', 'admins', '["push","in_app"]'::jsonb,
    'New signup: {familyName}',
    '{parentName} signed up with {playerCount} player(s). Tap to review.',
    '/admin/approvals/{familyId}',
    'Parent completes self-signup wizard. Admin reviews + approves.'),

  ('family.approval.granted', 'family', '["push","in_app"]'::jsonb,
    'You''re in!',
    'Your account has been approved. You can now book sessions.',
    '/parent',
    'Admin approves a self-signed-up family.'),

  ('family.approval.changes_requested', 'family', '["push","in_app"]'::jsonb,
    'One thing to fix',
    '{adminNote}',
    '/parent/onboarding?step=2',
    'Admin asks the parent to update something before approving.'),

  ('family.approval.rejected', 'family', '["push","in_app"]'::jsonb,
    'Account update',
    'Your account couldn''t be approved. Reach out to Maxim if you think this is a mistake.',
    '/parent',
    'Admin rejects a signup. Used rarely (spam / not-real-family).')
ON CONFLICT (event_type, audience) DO NOTHING;
