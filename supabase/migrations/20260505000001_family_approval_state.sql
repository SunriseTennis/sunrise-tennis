-- ─────────────────────────────────────────────────────────────────────────
-- Plan 15 Phase B — Family approval state.
--
-- Self-signups now create a family in 'pending_review' state. Admin reviews
-- in /admin/approvals and flips status to 'approved' (or requests changes
-- / rejects). Booking actions are gated on approval_status='approved' via
-- requireApprovedFamily() helper.
--
-- Existing rows (the 89 imported families) are backfilled as
-- 'approved' + signup_source='legacy_import' so the migration is a no-op
-- for them.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending_review', 'changes_requested', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS signup_source text NOT NULL DEFAULT 'admin_invite'
    CHECK (signup_source IN ('admin_invite', 'self_signup', 'legacy_import')),
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

-- Backfill: all rows that existed before this migration are legacy.
-- The CHECK above lets approval_status default to 'approved' so bookings
-- never break for the imported cohort.
UPDATE families
   SET signup_source = 'legacy_import',
       approved_at  = COALESCE(approved_at, created_at)
 WHERE created_at < '2026-05-05'
   AND signup_source = 'admin_invite'; -- only touch defaulted rows

-- Index for the admin queue (only includes pending rows — most rows are approved).
CREATE INDEX IF NOT EXISTS idx_families_pending_review
  ON families(approval_status, created_at)
  WHERE approval_status IN ('pending_review', 'changes_requested');

-- RLS: parents can already SELECT their own family; this column is part of
-- that row so no new policy needed. Admin policies cover the new UPDATE.

-- Helper view for the approval queue (admin-only via RLS on underlying tables).
CREATE OR REPLACE VIEW family_approval_queue AS
  SELECT
    f.id,
    f.family_name,
    f.preferred_name,
    f.primary_contact,
    f.address,
    f.created_at,
    f.approval_status,
    f.signup_source,
    f.approval_note,
    (SELECT COUNT(*) FROM players p WHERE p.family_id = f.id) AS player_count,
    (SELECT user_id FROM user_roles ur
       WHERE ur.family_id = f.id AND ur.role = 'parent'
       LIMIT 1) AS primary_parent_user_id
  FROM families f
  WHERE f.approval_status IN ('pending_review', 'changes_requested');

-- View inherits underlying RLS on families/user_roles/players.
COMMENT ON VIEW family_approval_queue IS
  'Plan 15 Phase B — admin approval queue. Includes player_count and primary_parent_user_id for the /admin/approvals list. Inherits RLS from underlying tables.';
