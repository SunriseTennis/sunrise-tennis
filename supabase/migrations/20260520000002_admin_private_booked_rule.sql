-- Plan 25 — Notification rule fired when admin books a private lesson on
-- behalf of a family (`adminBookPrivate` or `adminCreateSharedPrivate` in
-- admin/privates/actions.ts).
--
-- Pre-Plan-25 these two paths fired zero notifications — silent gap. The
-- family had no way to know they'd been booked unless they happened to
-- open /parent/bookings.
--
-- Body templates:
--   * Solo:       "{playerName} is booked for a private with {coachName} on {date} at {startTime}."
--   * Standing:   "{playerName} has a standing weekly private with {coachName} on {dayOfWeek}s at {startTime}."
--   * Shared:     "{playerName} is booked for a shared private with {partnerName} ({coachName}) on {date} at {startTime}."
--
-- The caller picks the right body template via a {bookingDescription}
-- placeholder so we don't need three separate rule rows.
--
-- Category defaults to 'booking' + non-mandatory (per Plan 22). A family
-- that's opted out of `booking` push won't hear the admin booking either
-- — same posture as parent-initiated enrol notifications.
--
-- Quiet hours: routed via dispatcher → audience='family' → deferred when
-- fired outside Adelaide-local 08:00–21:00. See Plan 25 + notification_outbox.

INSERT INTO notification_rules (
  event_type,
  audience,
  channels,
  title_template,
  body_template,
  url_template,
  description
) VALUES (
  'admin.private.booked',
  'family',
  '["push","in_app","email"]'::jsonb,
  'Private lesson booked',
  '{bookingDescription}',
  '/parent/bookings',
  'Fires when admin books a private lesson on behalf of a family (adminBookPrivate or adminCreateSharedPrivate). Caller composes the full body sentence and passes it as {bookingDescription}.'
)
ON CONFLICT (event_type, audience) DO UPDATE
SET channels       = EXCLUDED.channels,
    title_template = EXCLUDED.title_template,
    body_template  = EXCLUDED.body_template,
    url_template   = EXCLUDED.url_template,
    description    = EXCLUDED.description,
    enabled        = TRUE,
    updated_at     = now();
