-- Private Booking Feature: Alter Existing Tables
-- Adds columns to coaches, sessions, and bookings for private lesson support.

-- ── Coaches ────────────────────────────────────────────────────────────

ALTER TABLE coaches
  ADD COLUMN pay_period text NOT NULL DEFAULT 'weekly'
    CHECK (pay_period IN ('weekly', 'end_of_term'));

COMMENT ON COLUMN coaches.pay_period IS
  'Coach''s preferred pay period. George = weekly, Zoe = end_of_term.';

-- ── Sessions ───────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN completed_by uuid REFERENCES auth.users(id),
  ADD COLUMN duration_minutes smallint CHECK (duration_minutes > 0);

COMMENT ON COLUMN sessions.completed_by IS
  'User who marked this session as completed (coach or admin).';
COMMENT ON COLUMN sessions.duration_minutes IS
  'Explicit duration for private sessions (30, 45, 60). Groups use start/end time.';

-- ── Bookings ───────────────────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN approval_status text NOT NULL DEFAULT 'auto'
    CHECK (approval_status IN ('pending', 'approved', 'declined', 'auto')),
  ADD COLUMN approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN auto_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN second_player_id uuid REFERENCES players(id),
  ADD COLUMN second_family_id uuid REFERENCES families(id),
  ADD COLUMN duration_minutes smallint CHECK (duration_minutes > 0),
  ADD COLUMN is_standing boolean NOT NULL DEFAULT false,
  ADD COLUMN standing_parent_id uuid REFERENCES bookings(id),
  ADD COLUMN cancellation_type text
    CHECK (cancellation_type IS NULL OR cancellation_type IN (
      'parent_24h', 'parent_late', 'coach', 'admin', 'rain_heat', 'noshow'
    ));

COMMENT ON COLUMN bookings.approval_status IS
  'For private bookings: pending/approved/declined. Non-private bookings default to auto.';
COMMENT ON COLUMN bookings.second_player_id IS
  'For shared privates (max 2 players). NULL for solo privates.';
COMMENT ON COLUMN bookings.second_family_id IS
  'Family of the second player (may differ from primary family_id).';
COMMENT ON COLUMN bookings.is_standing IS
  'True for recurring weekly private lesson bookings.';
COMMENT ON COLUMN bookings.standing_parent_id IS
  'Links individual instances to the parent standing booking.';
COMMENT ON COLUMN bookings.cancellation_type IS
  'Tracks how a cancellation happened for policy enforcement.';

-- Set existing bookings to approved (they predate the approval flow)
UPDATE bookings SET approval_status = 'auto' WHERE approval_status = 'auto';
