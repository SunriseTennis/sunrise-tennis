-- Plan 21 — admin_link_signup_to_family RPC.
--
-- Re-points a self-signup parent's user_roles row to an existing
-- pre-created family (typically a legacy_import C### family that
-- already holds player history), drops the transient self-signup
-- family + its players, and forces the parent through onboarding on
-- the target family.
--
-- This handles the case where a parent self-signed up at /signup
-- BEFORE admin sent them an invite link. Without this, sending an
-- invite later collides on UNIQUE(user_id, role) because the parent
-- already has a parent row pointing at the wrong family.
--
-- The auth.users row stays put — the parent keeps their existing
-- password and email; only the family they belong to changes.
--
-- Returns jsonb of shape:
--   { "success": bool, "target_family_id": uuid, "parent_user_id": uuid,
--     "parent_email": text }

CREATE OR REPLACE FUNCTION admin_link_signup_to_family(
  p_signup_family_id uuid,
  p_target_family_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signup        record;
  v_target        record;
  v_user_id       uuid;
  v_parent_email  text;
  v_target_email  text;
  v_signup_pc     jsonb;
  v_target_pc     jsonb;
  v_existing_role uuid;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  -- Validate signup family.
  SELECT id, signup_source, approval_status, status, primary_contact
    INTO v_signup
    FROM families
   WHERE id = p_signup_family_id;

  IF v_signup IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Signup family not found');
  END IF;
  IF v_signup.signup_source <> 'self_signup' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source family is not a self-signup');
  END IF;
  IF v_signup.approval_status NOT IN ('pending_review', 'changes_requested') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Signup family is not in a linkable state');
  END IF;

  -- Validate target family.
  SELECT id, signup_source, status, primary_contact
    INTO v_target
    FROM families
   WHERE id = p_target_family_id;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target family not found');
  END IF;
  IF v_target.signup_source = 'self_signup' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target family is itself a self-signup; pick a legacy or admin-invite family');
  END IF;
  IF v_target.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target family is not active');
  END IF;

  -- Resolve the signup parent's user_id.
  SELECT user_id INTO v_user_id
    FROM user_roles
   WHERE family_id = p_signup_family_id AND role = 'parent'
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No parent role bound to the signup family');
  END IF;

  -- Idempotency: if this user already has a parent role on the target,
  -- short-circuit to a clean state. We still drop the signup family.
  SELECT id INTO v_existing_role
    FROM user_roles
   WHERE user_id = v_user_id AND role = 'parent' AND family_id = p_target_family_id;

  v_signup_pc := COALESCE(v_signup.primary_contact, '{}'::jsonb);
  v_parent_email := v_signup_pc->>'email';

  IF v_existing_role IS NULL THEN
    -- Re-point the parent's role to the target family.
    UPDATE user_roles
       SET family_id = p_target_family_id
     WHERE user_id = v_user_id AND role = 'parent';
  END IF;

  -- Drop transient self-signup intake (players, allowed-coaches, balance,
  -- pending invites, then the family row itself).
  DELETE FROM player_allowed_coaches
   WHERE player_id IN (SELECT id FROM players WHERE family_id = p_signup_family_id);
  DELETE FROM players       WHERE family_id = p_signup_family_id;
  DELETE FROM invitations   WHERE family_id = p_signup_family_id AND status = 'pending';
  DELETE FROM family_balance WHERE family_id = p_signup_family_id;
  -- Remove any leftover user_roles that still point at the signup family
  -- (should be none after the UPDATE above, but be defensive).
  DELETE FROM user_roles    WHERE family_id = p_signup_family_id;
  DELETE FROM families      WHERE id = p_signup_family_id;

  -- Force re-onboarding on the target so the parent walks the
  -- admin-invite wizard (contact pre-fill + Players + Terms+Consent +
  -- A2HS + Push). Ensure approval_status is 'approved' so the booking
  -- gate stays open after onboarding.
  UPDATE families
     SET completed_onboarding = false,
         approval_status      = 'approved',
         approved_at          = COALESCE(approved_at, now()),
         approved_by          = COALESCE(approved_by, auth.uid())
   WHERE id = p_target_family_id;

  -- If target's primary_contact has no email, copy the email + name we
  -- captured from the signup family. Don't overwrite an existing email
  -- — that's admin's call to make manually if it's wrong.
  v_target_pc := COALESCE(v_target.primary_contact, '{}'::jsonb);
  v_target_email := v_target_pc->>'email';

  IF (v_target_email IS NULL OR v_target_email = '')
     AND v_parent_email IS NOT NULL AND v_parent_email <> '' THEN
    UPDATE families
       SET primary_contact = v_target_pc
                            || jsonb_build_object('email', v_parent_email)
                            || CASE
                                 WHEN v_target_pc->>'name' IS NULL OR v_target_pc->>'name' = ''
                                 THEN jsonb_build_object(
                                   'name',       COALESCE(v_signup_pc->>'name', ''),
                                   'first_name', COALESCE(v_signup_pc->>'first_name', ''),
                                   'last_name',  COALESCE(v_signup_pc->>'last_name', '')
                                 )
                                 ELSE '{}'::jsonb
                               END
     WHERE id = p_target_family_id;
  END IF;

  RETURN jsonb_build_object(
    'success',           true,
    'target_family_id',  p_target_family_id,
    'parent_user_id',    v_user_id,
    'parent_email',      v_parent_email
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_link_signup_to_family(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_link_signup_to_family(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION admin_link_signup_to_family(uuid, uuid) IS
  'Plan 21 — admin-only. Re-points a self-signup parent''s user_roles row to a target legacy/admin-invite family, drops the signup family + players, forces re-onboarding on the target. Idempotent if the parent already has a role on target.';
