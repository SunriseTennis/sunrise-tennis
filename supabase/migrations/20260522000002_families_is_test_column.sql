-- ─────────────────────────────────────────────────────────────────────────
-- Bundled with Plan 25 — `families.is_test` flag.
--
-- Test families exist (Maxim's S002, the Plan 18 TPLN18-001 reset, future
-- one-offs). Their data shape matches real families: charges, enrolments,
-- bookings, payments. The Plan 21 `admin_delete_family` RPC's FK pre-flight
-- correctly refuses to wipe them because real-shape data is exactly what
-- it's defending against. But that defence makes test-account cleanup a
-- chore.
--
-- `is_test=true` opt-in flag unlocks `admin_force_delete_test_family`
-- (separate migration) which cascades through every dependent table.
-- Defaults to false → real families are unaffected. The force-delete
-- RPC refuses unless is_test=true → real families can't be accidentally
-- nuked even by an admin typing the wrong UUID.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN families.is_test IS
  'When true, this family is exempt from FK-preflight blockers in admin_force_delete_test_family. '
  'Real families MUST stay false. Set via admin UI on /admin/families/[id]. '
  'Bundled with Plan 25, 12-May-2026.';

-- Seed Maxim's known test families. Other display_ids can be flagged via
-- the admin UI as needed.
UPDATE families SET is_test = true
  WHERE display_id IN ('S002', 'TPLN18-001');
