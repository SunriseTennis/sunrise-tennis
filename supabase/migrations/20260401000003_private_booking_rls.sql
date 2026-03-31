-- Private Booking Feature: RLS Policies
-- Enables RLS on all new tables and adds missing policies on existing tables.

-- ============================================================================
-- Enable RLS on new tables
-- ============================================================================

ALTER TABLE coach_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_allowed_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_tracker ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- coach_availability
-- ============================================================================

-- Admin: full access
CREATE POLICY "admin_coach_availability_all" ON coach_availability
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Coach: read/write own
CREATE POLICY "coach_availability_select" ON coach_availability FOR SELECT
  USING (coach_id = get_user_coach_id(auth.uid()));

CREATE POLICY "coach_availability_insert" ON coach_availability FOR INSERT
  WITH CHECK (coach_id = get_user_coach_id(auth.uid()));

CREATE POLICY "coach_availability_update" ON coach_availability FOR UPDATE
  USING (coach_id = get_user_coach_id(auth.uid()));

CREATE POLICY "coach_availability_delete" ON coach_availability FOR DELETE
  USING (coach_id = get_user_coach_id(auth.uid()));

-- Parent: read all (needed to see available slots when booking)
CREATE POLICY "parent_coach_availability_select" ON coach_availability FOR SELECT
  USING (get_user_family_id(auth.uid()) IS NOT NULL);

-- ============================================================================
-- coach_availability_exceptions
-- ============================================================================

-- Admin: full access
CREATE POLICY "admin_coach_exceptions_all" ON coach_availability_exceptions
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Coach: read/write own
CREATE POLICY "coach_exceptions_select" ON coach_availability_exceptions FOR SELECT
  USING (coach_id = get_user_coach_id(auth.uid()));

CREATE POLICY "coach_exceptions_insert" ON coach_availability_exceptions FOR INSERT
  WITH CHECK (coach_id = get_user_coach_id(auth.uid()));

CREATE POLICY "coach_exceptions_update" ON coach_availability_exceptions FOR UPDATE
  USING (coach_id = get_user_coach_id(auth.uid()));

CREATE POLICY "coach_exceptions_delete" ON coach_availability_exceptions FOR DELETE
  USING (coach_id = get_user_coach_id(auth.uid()));

-- Parent: read all (needed for slot computation)
CREATE POLICY "parent_coach_exceptions_select" ON coach_availability_exceptions FOR SELECT
  USING (get_user_family_id(auth.uid()) IS NOT NULL);

-- ============================================================================
-- player_allowed_coaches
-- ============================================================================

-- Admin: full access
CREATE POLICY "admin_allowed_coaches_all" ON player_allowed_coaches
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Parent: read own players' allowlists
CREATE POLICY "parent_allowed_coaches_select" ON player_allowed_coaches FOR SELECT
  USING (player_id IN (
    SELECT id FROM players WHERE family_id = get_user_family_id(auth.uid())
  ));

-- Coach: read where they are the allowed coach
CREATE POLICY "coach_allowed_coaches_select" ON player_allowed_coaches FOR SELECT
  USING (coach_id = get_user_coach_id(auth.uid()));

-- ============================================================================
-- coach_earnings
-- ============================================================================

-- Admin: full access
CREATE POLICY "admin_coach_earnings_all" ON coach_earnings
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Coach: read own
CREATE POLICY "coach_earnings_select" ON coach_earnings FOR SELECT
  USING (coach_id = get_user_coach_id(auth.uid()));

-- ============================================================================
-- coach_payments
-- ============================================================================

-- Admin: full access
CREATE POLICY "admin_coach_payments_all" ON coach_payments
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Coach: read own
CREATE POLICY "coach_payments_select" ON coach_payments FOR SELECT
  USING (coach_id = get_user_coach_id(auth.uid()));

-- ============================================================================
-- cancellation_tracker
-- ============================================================================

-- Admin: full access
CREATE POLICY "admin_cancellation_tracker_all" ON cancellation_tracker
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Parent: read own family
CREATE POLICY "parent_cancellation_tracker_select" ON cancellation_tracker FOR SELECT
  USING (family_id = get_user_family_id(auth.uid()));

-- ============================================================================
-- Fix: Parents need to read coaches table (for booking flow)
-- Coach name and rate are not sensitive data.
-- ============================================================================

CREATE POLICY "parent_coaches_select" ON coaches FOR SELECT
  USING (get_user_family_id(auth.uid()) IS NOT NULL);

-- ============================================================================
-- Fix: Parents need to see private sessions linked to their bookings
-- Existing policies only cover sessions via attendances or program_roster.
-- ============================================================================

CREATE POLICY "parent_sessions_via_booking" ON sessions FOR SELECT
  USING (id IN (
    SELECT session_id FROM bookings
    WHERE session_id IS NOT NULL
    AND (
      family_id = get_user_family_id(auth.uid())
      OR second_family_id = get_user_family_id(auth.uid())
    )
  ));

-- ============================================================================
-- Fix: Coaches need to see bookings for their private sessions
-- (to confirm/decline requests and see who booked)
-- ============================================================================

CREATE POLICY "coach_bookings_select" ON bookings FOR SELECT
  USING (session_id IN (
    SELECT id FROM sessions WHERE coach_id = get_user_coach_id(auth.uid())
  ));

-- ============================================================================
-- Fix: Parents need to see bookings for shared privates (second family)
-- Existing parent_bookings_select only checks family_id, not second_family_id.
-- ============================================================================

CREATE POLICY "parent_bookings_shared_select" ON bookings FOR SELECT
  USING (second_family_id = get_user_family_id(auth.uid()));
