-- Capture partial coach attendance (came late / left early / out for a private mid-session).
-- Additive: NULL actual_minutes preserves current group-pay derivation (full session duration).
-- Widen status CHECK to allow 'partial' alongside the existing 'present'/'absent'.

ALTER TABLE session_coach_attendances
  DROP CONSTRAINT IF EXISTS session_coach_attendances_status_check;

ALTER TABLE session_coach_attendances
  ADD CONSTRAINT session_coach_attendances_status_check
  CHECK (status IN ('present', 'absent', 'partial'));

ALTER TABLE session_coach_attendances
  ADD COLUMN IF NOT EXISTS actual_minutes int NULL CHECK (actual_minutes >= 0);

ALTER TABLE session_coach_attendances
  ADD COLUMN IF NOT EXISTS note text NULL;

COMMENT ON COLUMN session_coach_attendances.actual_minutes IS
  'Minutes the coach actually worked in this session. NULL = full session duration. Used by group-pay derivation in admin + coach earnings views.';

COMMENT ON COLUMN session_coach_attendances.note IS
  'Optional note (e.g. "out for private 4:15-4:45"). Surfaced on session detail + coach detail pages.';
