-- Normalize legacy short-form gender values on players + lock the column
-- with a CHECK constraint so the canonical set ('male','female','non_binary')
-- is enforced at the DB layer.
--
-- Background: the FTD import passed through 'M'/'F' values from legacy index
-- files unchanged (scripts/import-ftd-data.mjs:240). All current UI forms
-- write the long form. The mismatch silently filtered 60 players out of
-- every gender-restricted program (Wed Girls Red/Orange/Green/Yellow) because
-- isEligible() in src/lib/utils/eligibility.ts compares strict-equal against
-- programs.gender_restriction which is constrained to ('male','female').
--
-- Symptom: Reeva Modi (classifications ['green','yellow'], gender 'F') only
-- saw Wed Yellow Ball (mixed-gender) on the parent programs surface, not
-- Wed Girls Green or Wed Girls Yellow.

UPDATE players
SET gender = CASE gender
  WHEN 'M' THEN 'male'
  WHEN 'F' THEN 'female'
END
WHERE gender IN ('M', 'F');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_gender_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_gender_check
      CHECK (gender IS NULL OR gender IN ('male', 'female', 'non_binary'));
  END IF;
END $$;
