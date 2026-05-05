-- Plan 21 — notification rule for the new admin link-signup flow.
--
-- Fires from `linkSignupToExistingFamily` server action after the
-- admin_link_signup_to_family RPC succeeds. Tells the parent their
-- self-signup has been connected to an existing family on Sunrise
-- and they should log in (using the password they set during signup)
-- to finish onboarding.

INSERT INTO notification_rules (
  event_type,
  audience,
  channels,
  title_template,
  body_template,
  url_template,
  description
) VALUES (
  'family.account_linked',
  'family',
  '["push","in_app","email"]'::jsonb,
  'Your Sunrise Tennis account is linked',
  'We''ve connected your signup to your existing {familyName} family. Log in with the password you set during signup to finish onboarding.',
  '/login',
  'Plan 21 — fired when admin links a self-signup parent to an existing legacy/admin-invite family via /admin/approvals.'
)
ON CONFLICT (event_type, audience) DO UPDATE
SET channels       = EXCLUDED.channels,
    title_template = EXCLUDED.title_template,
    body_template  = EXCLUDED.body_template,
    url_template   = EXCLUDED.url_template,
    description    = EXCLUDED.description,
    enabled        = TRUE,
    updated_at     = now();
