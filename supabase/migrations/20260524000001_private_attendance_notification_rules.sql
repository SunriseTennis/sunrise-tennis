-- Plan `velvety-whistling-boot` — Notification rules for the private session
-- attendance picker (Present / Absent / No-show).
--
-- Three new rules:
--   1. admin.private.attendance_absent — fires for each family marked Absent.
--      Charge is voided; family is credited.
--   2. admin.private.attendance_noshow — fires for each family marked No-show.
--      Charge stands (forfeit); noshow_count incremented.
--   3. admin.private.converted_to_solo — fires for the REMAINING family when a
--      shared private has one absent/no-show partner. Top-up charge added.
--
-- All three: audience=family, channels=push+in_app+email, category=booking,
-- non-mandatory. Same shape as admin.private.booked (Plan 25). Quiet-hours
-- deferral comes free via the dispatcher's audience='family' branch.

INSERT INTO notification_rules (
  event_type,
  audience,
  channels,
  title_template,
  body_template,
  url_template,
  description
) VALUES
  (
    'admin.private.attendance_absent',
    'family',
    '["push","in_app","email"]'::jsonb,
    'Marked absent',
    '{playerName} was marked absent for the {date} private with {coachName}. Full credit applied.',
    '/parent/bookings',
    'Fires when admin or coach marks a private booking Absent via the attendance picker. Charge is voided (excused absence).'
  ),
  (
    'admin.private.attendance_noshow',
    'family',
    '["push","in_app","email"]'::jsonb,
    'Marked no-show',
    '{playerName} was marked no-show for the {date} private with {coachName}. The {amount} charge stands.',
    '/parent/bookings',
    'Fires when admin or coach marks a private booking No-show via the attendance picker. Charge is kept as forfeit; noshow_count incremented.'
  ),
  (
    'admin.private.converted_to_solo',
    'family',
    '["push","in_app","email"]'::jsonb,
    'Shared private became a solo',
    '{playerName}''s shared private on {date} became a solo — {partnerName} did not attend. Top-up charge added; full private rate now applies.',
    '/parent/bookings',
    'Fires for the remaining family when a shared private converts to a solo via the attendance picker. Top-up charge ($40 by default) has already been added to the family.'
  )
ON CONFLICT (event_type, audience) DO UPDATE
SET channels       = EXCLUDED.channels,
    title_template = EXCLUDED.title_template,
    body_template  = EXCLUDED.body_template,
    url_template   = EXCLUDED.url_template,
    description    = EXCLUDED.description,
    enabled        = TRUE,
    updated_at     = now();
