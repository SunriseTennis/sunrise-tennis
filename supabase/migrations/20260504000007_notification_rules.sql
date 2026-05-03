-- ─────────────────────────────────────────────────────────────────────────
-- Plan 11 — Notification rules registry.
--
-- Today every notification is hardcoded in 14 server-action files. This
-- table moves the *configuration* (which events fire, who hears them,
-- what they say, on which channels) into the database so admin can edit
-- them through a UI rather than asking Claude to wire each one.
--
-- Rule resolution: dispatchNotification(eventType, context) reads rows
-- WHERE event_type = $1 AND enabled = TRUE, then for each rule resolves
-- audience to userIds and renders title/body/url templates against
-- context. See src/lib/notifications/dispatch.ts.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  /** 'admins' | 'family' | 'coach' | 'eligible_families' (extensible). */
  audience text NOT NULL,
  enabled boolean NOT NULL DEFAULT TRUE,
  /** Subset of: 'push', 'in_app', 'email' (email is future). */
  channels jsonb NOT NULL DEFAULT '["push","in_app"]'::jsonb,
  title_template text NOT NULL,
  body_template text,
  url_template text,
  /** Optional human-readable description shown in the admin UI. */
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type, audience)
);

CREATE INDEX IF NOT EXISTS notification_rules_event_idx
  ON notification_rules (event_type) WHERE enabled;

ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

-- Admin-only access.
DROP POLICY IF EXISTS notification_rules_admin_select ON notification_rules;
CREATE POLICY notification_rules_admin_select ON notification_rules
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS notification_rules_admin_all ON notification_rules;
CREATE POLICY notification_rules_admin_all ON notification_rules
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Maintain updated_at on row mutation.
CREATE OR REPLACE FUNCTION notification_rules_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_rules_set_updated_at ON notification_rules;
CREATE TRIGGER notification_rules_set_updated_at
  BEFORE UPDATE ON notification_rules
  FOR EACH ROW EXECUTE FUNCTION notification_rules_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Seed rules — match current hardcoded behaviour. Templates use
-- {placeholders} that the dispatcher fills from the context object.
-- Audience = 'admins' fans out to all admins; 'family' uses context.familyId;
-- 'coach' uses context.coachId; 'eligible_families' uses context.coachId
-- via the existing getEligibleParentUserIds helper.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO notification_rules (event_type, audience, channels, title_template, body_template, url_template, description) VALUES
  ('parent.private.requested', 'admins', '["push","in_app"]'::jsonb,
    'New Booking Request',
    '{playerName} - {date} at {time} ({duration}min)',
    '/admin/bookings',
    'Parent submits a one-off private booking request.'),
  ('parent.private.requested', 'coach', '["push","in_app"]'::jsonb,
    'New Booking Request',
    '{playerName} - {date} at {time} ({duration}min)',
    '/coach/privates',
    'Coach assigned to a one-off private booking.'),
  ('parent.private.standing_requested', 'admins', '["push","in_app"]'::jsonb,
    'New Standing Booking',
    '{playerName} - {date} at {time} ({duration}min, weekly)',
    '/admin/bookings',
    'Parent submits a standing private booking request.'),
  ('parent.private.standing_requested', 'coach', '["push","in_app"]'::jsonb,
    'New Standing Booking',
    '{playerName} - {date} at {time} ({duration}min, weekly)',
    '/coach/privates',
    'Coach assigned to a new standing private booking.'),
  ('parent.private.cancelled', 'admins', '["push","in_app"]'::jsonb,
    'Private Lesson Cancelled',
    '{playerName} - {date} at {time}',
    '/admin/privates',
    'Parent cancels a private booking.'),
  ('parent.private.cancelled', 'coach', '["push","in_app"]'::jsonb,
    'Private Lesson Cancelled',
    '{playerName} - {date} at {time}',
    '/coach/privates',
    'Coach assigned to a cancelled private booking.'),
  ('parent.standing_slot.freed', 'eligible_families', '["push"]'::jsonb,
    'Private Slot Available',
    'A private lesson slot is available on {date} at {time}',
    '/parent/bookings',
    'Standing private cancelled with 24h+ notice — slot opened up to other eligible families.'),
  ('parent.private.partner_cancelled', 'family', '["push","in_app"]'::jsonb,
    'Shared private — partner cancelled',
    'Your shared private with {coachName} on {date} is now solo. Admin will adjust the rate after the session.',
    '/parent/bookings',
    'Sent to the remaining family when the other half of a shared private cancels.'),
  ('parent.program.enrolled', 'admins', '["push","in_app"]'::jsonb,
    'New Program Enrolment',
    '{playerName} enrolled in {programName}',
    '/admin/programs',
    'Parent enrols a player in a term program.'),
  ('parent.program.unenrolled', 'admins', '["push","in_app"]'::jsonb,
    'Program Unenrolment',
    '{playerName} unenrolled from {programName}',
    '/admin/programs',
    'Parent unenrols a player from a term program.'),
  ('parent.session.booked', 'admins', '["push","in_app"]'::jsonb,
    'Casual Session Booked',
    '{playerName} booked into {programName} on {date}',
    '/admin/sessions',
    'Parent books a one-off casual session.'),
  ('parent.session.away', 'coach', '["push","in_app"]'::jsonb,
    'Player Marked Away',
    '{playerName} marked away from {programName} on {date}',
    '/coach',
    'Parent marks a player away for a single session.'),
  ('parent.player.added', 'admins', '["push","in_app"]'::jsonb,
    'New player added by parent',
    '{familyName} added {playerName}{ballColorSuffix}. Confirm ball level + classifications.',
    '/admin/families',
    'Parent registers a new player from /parent/players/new.'),
  ('parent.player.updated', 'admins', '["in_app"]'::jsonb,
    'Player details updated',
    '{familyName} updated {playerName}',
    '/admin/families',
    'Parent edits an existing player''s details.'),
  ('parent.voucher.submitted', 'admins', '["push","in_app"]'::jsonb,
    'Voucher submitted',
    '{familyName} submitted a voucher for {playerName} ({voucherCode})',
    '/admin/vouchers',
    'Parent submits a Sports Voucher for review.'),
  ('parent.message.sent', 'admins', '["push","in_app"]'::jsonb,
    'New Message',
    'New message from {familyName}',
    '/admin/messages',
    'Parent sends a new message thread to admin.'),
  ('coach.private.confirmed', 'family', '["push","in_app"]'::jsonb,
    'Private Lesson Confirmed',
    '{playerName} - {date} at {time} ({duration}min)',
    '/parent/bookings',
    'Coach confirms a pending private booking.'),
  ('coach.private.declined', 'family', '["push","in_app"]'::jsonb,
    'Private Lesson Declined',
    '{playerName} - {date} at {time}',
    '/parent/bookings',
    'Coach declines a pending private booking.'),
  ('admin.session.cancelled', 'family', '["push","in_app"]'::jsonb,
    'Session Cancelled',
    '{programName} on {date} at {time} has been cancelled. {creditNote}',
    '/parent/programs',
    'Admin cancels a single session — notifies all enrolled families.'),
  ('admin.session.rained_out', 'family', '["push","in_app"]'::jsonb,
    'Today''s sessions rained out',
    'All today''s sessions have been cancelled due to rain. Credits applied automatically.',
    '/parent',
    'Admin rain-outs all of today''s sessions in one action.'),
  ('admin.charge.upcoming', 'family', '["push"]'::jsonb,
    'Heads-up: charges in 10 days',
    'You have {chargeCount} charge(s) coming up totalling {chargeAmount}. Pay ahead any time.',
    '/parent/payments',
    'Pre-charge cron 10 days before scheduled session charges.'),
  ('admin.shared_private.converted', 'family', '["push","in_app"]'::jsonb,
    'Shared private converted to solo',
    'Your shared private on {date} became a solo lesson. Top-up charge added.',
    '/parent/bookings',
    'Admin or coach converts a shared private to solo when one player no-shows.')
ON CONFLICT (event_type, audience) DO NOTHING;
