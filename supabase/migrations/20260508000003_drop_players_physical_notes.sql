-- Plan 19 — Drop players.physical_notes
--
-- Maxim's call after live-testing: medical notes only; physical notes
-- adds nothing once a parent flags an injury via a normal message or
-- by-the-court conversation. Pre-flight (04-May-2026) confirmed zero
-- rows had non-null physical_notes — safe drop, no data lost.
--
-- Two dependents need to drop first (otherwise PostgreSQL refuses):
-- 1. The encrypt_medical_on_write trigger (BEFORE INSERT/UPDATE OF
--    medical_notes, physical_notes) — recreated below scoped to
--    medical_notes only.
-- 2. The get_player_medical_notes RPC — recreated returning only
--    medical_notes (its TABLE signature can't be ALTERed in-place).

DROP TRIGGER IF EXISTS encrypt_medical_on_write ON players;
DROP FUNCTION IF EXISTS get_player_medical_notes(uuid);

ALTER TABLE players DROP COLUMN IF EXISTS physical_notes;

-- Recreate the encrypt-on-write trigger function without the
-- physical_notes branch.
CREATE OR REPLACE FUNCTION encrypt_player_medical_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.medical_notes IS NOT NULL AND NEW.medical_notes != '' THEN
    IF NEW.medical_notes NOT LIKE 'ww0E%' AND NEW.medical_notes NOT LIKE 'ww4E%' THEN
      NEW.medical_notes := encrypt_medical(NEW.medical_notes);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER encrypt_medical_on_write
  BEFORE INSERT OR UPDATE OF medical_notes ON players
  FOR EACH ROW EXECUTE FUNCTION encrypt_player_medical_trigger();

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
