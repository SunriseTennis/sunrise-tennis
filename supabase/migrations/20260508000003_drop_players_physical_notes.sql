-- Plan 19 — Drop players.physical_notes
--
-- Maxim's call after live-testing: medical notes only; physical notes
-- adds nothing once a parent flags an injury via a normal message or
-- by-the-court conversation. Pre-flight (04-May-2026) confirmed zero
-- rows had non-null physical_notes — safe drop, no data lost.
--
-- The get_player_medical_notes RPC currently returns physical_notes in
-- its TABLE signature (migration 20260319000006). Postgres won't let us
-- ALTER the return signature in-place, so DROP + recreate without it.

DROP FUNCTION IF EXISTS get_player_medical_notes(uuid);

ALTER TABLE players DROP COLUMN IF EXISTS physical_notes;

CREATE OR REPLACE FUNCTION get_player_medical_notes(p_player_id uuid)
RETURNS TABLE(medical_notes text) AS $$
  SELECT
    decrypt_medical(p.medical_notes) as medical_notes
  FROM players p
  WHERE p.id = p_player_id
    AND (
      is_admin(auth.uid())
      OR p.family_id = get_user_family_id(auth.uid())
      OR p.coach_id = get_user_coach_id(auth.uid())
      OR p.id IN (
        SELECT pr.player_id FROM program_roster pr
        JOIN program_coaches pc ON pc.program_id = pr.program_id
        WHERE pc.coach_id = get_user_coach_id(auth.uid())
        AND pr.status = 'enrolled'
      )
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
