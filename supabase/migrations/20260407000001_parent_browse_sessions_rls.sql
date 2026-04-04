-- Allow parents to see sessions for ANY active program (not just enrolled ones).
--
-- The existing parent session policies restrict visibility to:
--   1. parent_sessions_program_select: sessions for enrolled programs only
--   2. parent_sessions_select: sessions where their player has attendance records
--   3. parent_sessions_via_booking: sessions linked to their private bookings
--
-- This means the programs browse page (/parent/programs) shows an empty calendar
-- for programs the parent hasn't enrolled in yet — they can't see session dates
-- before deciding to enrol.
--
-- Session rows contain only scheduling info (date, time, coach_id, status) —
-- no sensitive data. Attendance records (who actually attended) remain restricted.

CREATE POLICY "authenticated_sessions_active_programs" ON sessions FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND program_id IN (SELECT id FROM programs WHERE status = 'active')
  );
