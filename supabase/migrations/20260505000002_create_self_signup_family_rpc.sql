-- ─────────────────────────────────────────────────────────────────────────
-- Plan 15 Phase B — RPCs for the self-signup approval flow.
--
-- create_self_signup_family(p_family_name, p_primary_contact)
--   Called from the new self-signup wizard (or B.0 backfill script for
--   existing orphans). Creates a families row in 'pending_review' state
--   plus a user_roles row binding the calling user as parent. Returns the
--   new family_id. Idempotent at the user level — if the calling user
--   already has any role, returns existing role's family_id without
--   creating a new family.
--
-- approve_family / request_family_changes / reject_family
--   Admin-only state transitions, called from /admin/approvals server
--   actions. Wrap them in SECURITY DEFINER so the audit trail can include
--   approved_by even when RLS is in play.
--
-- All four are SECURITY DEFINER. Admin checks use is_admin(auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_self_signup_family(
  p_family_name text,
  p_primary_contact jsonb DEFAULT '{}'::jsonb
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

  -- Generate a self-signup display_id. Format S001..., separate from C001
  -- (admin-created) and T001-T010 (test) namespaces. Collision-safe via
  -- the loop, capped at 999 attempts.
  FOR i IN 1..999 LOOP
    v_display_id := 'S' || lpad(
      (SELECT COALESCE(MAX(SUBSTRING(display_id FROM 2)::int), 0) + 1
         FROM families
        WHERE display_id ~ '^S[0-9]+$')::text, 3, '0');
    BEGIN
      INSERT INTO families (
        display_id, family_name, primary_contact,
        approval_status, signup_source, status
      ) VALUES (
        v_display_id, trim(p_family_name), p_primary_contact,
        'pending_review', 'self_signup', 'active'
      ) RETURNING id INTO v_family_id;
      EXIT; -- success
    EXCEPTION WHEN unique_violation THEN
      -- Race condition on display_id; loop tries the next number.
      CONTINUE;
    END;
  END LOOP;

  IF v_family_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not allocate display_id');
  END IF;

  -- Create the parent role pointing at the new family.
  INSERT INTO user_roles (user_id, role, family_id)
    VALUES (v_user_id, 'parent', v_family_id);

  RETURN jsonb_build_object(
    'success', true,
    'family_id', v_family_id,
    'display_id', v_display_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_self_signup_family(text, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_family(
  p_family_id uuid,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF NOT is_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin only');
  END IF;

  UPDATE families SET
    approval_status = 'approved',
    approval_note   = p_note,
    approved_at     = now(),
    approved_by     = v_user_id,
    updated_at      = now()
  WHERE id = p_family_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Family not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_family(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION request_family_changes(
  p_family_id uuid,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF NOT is_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin only');
  END IF;

  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'note required');
  END IF;

  UPDATE families SET
    approval_status = 'changes_requested',
    approval_note   = trim(p_note),
    updated_at      = now()
  WHERE id = p_family_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Family not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION request_family_changes(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_family(
  p_family_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF NOT is_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin only');
  END IF;

  UPDATE families SET
    approval_status = 'rejected',
    approval_note   = COALESCE(trim(p_reason), 'Rejected by admin'),
    status          = 'archived',
    updated_at      = now()
  WHERE id = p_family_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Family not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_family(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Resubmit path — when a parent edits after 'changes_requested', the
-- status flips back to 'pending_review'. Called from parent server actions
-- (e.g. createPlayerFromParent, updatePlayerDetails, updateContactInfo).
-- Idempotent: only flips if currently 'changes_requested'.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resubmit_family_for_review(
  p_family_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_owner_role record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Caller must own this family OR be admin.
  SELECT * INTO v_owner_role FROM user_roles
   WHERE user_id = v_user_id
     AND family_id = p_family_id
     AND role = 'parent';

  IF v_owner_role IS NULL AND NOT is_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your family');
  END IF;

  UPDATE families SET
    approval_status = 'pending_review',
    updated_at      = now()
  WHERE id = p_family_id
    AND approval_status = 'changes_requested';

  RETURN jsonb_build_object('success', true, 'flipped', FOUND);
END;
$$;

GRANT EXECUTE ON FUNCTION resubmit_family_for_review(uuid) TO authenticated;
