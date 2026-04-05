-- Migration: Add completed_onboarding flag to families table
-- Used to skip the parent onboarding wizard after first completion.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS completed_onboarding boolean NOT NULL DEFAULT false;
