-- Plan 18 — Bind invitation token to email
--
-- Until now `claim_invitation` matched only on the token. Anyone who
-- got the link could claim a pending invitation under any account email.
-- The form copy implies the invitation is sent to a specific address;
-- this migration enforces that contract.
--
-- Case-insensitive match: invitations.email and auth.users.email may
-- differ in case (Gmail typically lowercases on signup).

CREATE OR REPLACE FUNCTION claim_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation record;
  v_user_id uuid;
  v_user_email text;
  v_existing_role record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Idempotent — don't double-assign if user already has a role.
  SELECT * INTO v_existing_role FROM user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_existing_role IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_claimed', true, 'role', v_existing_role.role);
  END IF;

  SELECT * INTO v_invitation FROM invitations
    WHERE token = p_token AND status = 'pending';

  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or already claimed invitation');
  END IF;

  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation has expired');
  END IF;

  -- Plan 18 — email-binding check. Look up the auth user's email and
  -- require it to match the invitation's email (case-insensitive).
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL OR lower(v_user_email) IS DISTINCT FROM lower(v_invitation.email) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This invitation was sent to a different email address. Please sign in with the email it was sent to.'
    );
  END IF;

  INSERT INTO user_roles (user_id, role, family_id)
    VALUES (v_user_id, 'parent', v_invitation.family_id);

  UPDATE invitations SET
    status = 'claimed',
    claimed_by = v_user_id,
    claimed_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object('success', true, 'family_id', v_invitation.family_id);
END;
$$;
