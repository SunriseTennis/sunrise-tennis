-- Migration: Record T&C acknowledgement per family
-- Adds families.terms_acknowledged_at (timestamptz). Backfilled with now() for
-- already-onboarded families so returning parents are not gated.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS terms_acknowledged_at timestamptz;

-- Backfill existing onboarded families so they aren't re-prompted.
UPDATE families
SET terms_acknowledged_at = now()
WHERE completed_onboarding = true
  AND terms_acknowledged_at IS NULL;

COMMENT ON COLUMN families.terms_acknowledged_at IS
  'Timestamp when the primary parent last acknowledged the T&Cs via the onboarding wizard. Bumped when material terms change and re-acknowledgement is requested.';
