-- ─────────────────────────────────────────────────────────────────────────
-- Plan 15 Phase D — Soft funnel filter on /signup.
--
-- Adds optional referral_source + referral_source_detail to families.
-- Captured at signup, surfaced in /admin/approvals so Maxim can see
-- where new families heard about Sunrise (without gating signup).
--
-- Values: 'word_of_mouth', 'google', 'social', 'school', 'walked_past',
-- 'event', 'other', NULL. The detail column carries the school name or
-- the "other" free-text. Kept generous for analytics later.
--
-- Also extends create_self_signup_family RPC to accept and persist these
-- two fields — the dashboard handoff passes them in from user_metadata.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS referral_source text
    CHECK (referral_source IS NULL OR referral_source IN (
      'word_of_mouth', 'google', 'social', 'school', 'walked_past', 'event', 'other'
    )),
  ADD COLUMN IF NOT EXISTS referral_source_detail text;

COMMENT ON COLUMN families.referral_source IS
  'Plan 15 Phase D — soft funnel filter captured at /signup. NULL for legacy + admin-invite families.';
COMMENT ON COLUMN families.referral_source_detail IS
  'Plan 15 Phase D — free-text detail (school name when referral_source=school, free text when "other").';

-- Drop existing 2-arg signature so we can extend it.
DROP FUNCTION IF EXISTS create_self_signup_family(text, jsonb);

CREATE OR REPLACE FUNCTION create_self_signup_family(
  p_family_name text,
  p_primary_contact jsonb DEFAULT '{}'::jsonb,
  p_referral_source text DEFAULT NULL,
  p_referral_source_detail text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing_role record;
  v_family_id uuid;
  v_display_id text;
  v_normalised_source text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Idempotent — if user already has a role, return its family.
  SELECT * INTO v_existing_role FROM user_roles
   WHERE user_id = v_user_id LIMIT 1;
  IF v_existing_role IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_assigned', true,
      'family_id', v_existing_role.family_id,
      'role', v_existing_role.role
    );
  END IF;

  -- Validate input.
  IF p_family_name IS NULL OR length(trim(p_family_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'family_name required');
  END IF;

  -- Normalise referral_source: any string not in the allowed set becomes NULL
  -- so the CHECK constraint never blocks an unexpected payload.
  v_normalised_source := CASE
    WHEN p_referral_source IN ('word_of_mouth', 'google', 'social', 'school', 'walked_past', 'event', 'other')
      THEN p_referral_source
    ELSE NULL
  END;

  -- Generate a self-signup display_id (S001 namespace).
  FOR i IN 1..999 LOOP
    v_display_id := 'S' || lpad(
      (SELECT COALESCE(MAX(SUBSTRING(display_id FROM 2)::int), 0) + 1
         FROM families
        WHERE display_id ~ '^S[0-9]+$')::text, 3, '0');
    BEGIN
      INSERT INTO families (
        display_id, family_name, primary_contact,
        approval_status, signup_source, status,
        referral_source, referral_source_detail
      ) VALUES (
        v_display_id, trim(p_family_name), p_primary_contact,
        'pending_review', 'self_signup', 'active',
        v_normalised_source,
        NULLIF(trim(COALESCE(p_referral_source_detail, '')), '')
      ) RETURNING id INTO v_family_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  IF v_family_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not allocate display_id');
  END IF;

  INSERT INTO user_roles (user_id, role, family_id)
    VALUES (v_user_id, 'parent', v_family_id);

  RETURN jsonb_build_object(
    'success', true,
    'family_id', v_family_id,
    'display_id', v_display_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_self_signup_family(text, jsonb, text, text) TO authenticated;

-- Also surface in the approval queue view so /admin/approvals list can show
-- the funnel signal without an extra query. New columns appended at the end —
-- CREATE OR REPLACE VIEW cannot reorder existing columns.
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
       LIMIT 1) AS primary_parent_user_id,
    f.referral_source,
    f.referral_source_detail
  FROM families f
  WHERE f.approval_status IN ('pending_review', 'changes_requested');

COMMENT ON VIEW family_approval_queue IS
  'Plan 15 Phase B/D — admin approval queue. Includes funnel signal + player_count + primary_parent_user_id. Inherits RLS from underlying tables.';
