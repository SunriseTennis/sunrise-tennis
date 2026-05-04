-- Plan 18 — peek_invitation_email RPC for the /signup?invite=... page.
--
-- The signup page needs the invited email (to pre-fill + readonly the
-- field, so the parent can't accidentally type a different address that
-- claim_invitation would later reject). The signup page runs
-- unauthenticated — RLS on invitations gates SELECT on auth.uid()
-- IS NOT NULL — so we expose a narrow SECURITY DEFINER RPC that returns
-- only the metadata needed for the form, and only for valid pending
-- non-expired invitations.
--
-- No PII beyond the email is returned (no created_by, no token,
-- no claim history). The token is the bearer secret — anyone with it
-- can already see the email by claiming the invitation, so this RPC
-- doesn't widen the existing exposure surface.

CREATE OR REPLACE FUNCTION peek_invitation_email(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation record;
  v_family_name text;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'missing_token');
  END IF;

  SELECT * INTO v_invitation FROM invitations
    WHERE token = p_token AND status = 'pending';

  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found_or_claimed');
  END IF;

  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  SELECT family_name INTO v_family_name FROM families WHERE id = v_invitation.family_id;

  RETURN jsonb_build_object(
    'valid', true,
    'email', v_invitation.email,
    'family_name', v_family_name,
    'expires_at', v_invitation.expires_at
  );
END;
$$;

-- Allow anonymous access — this is intentional, the signup page is public.
GRANT EXECUTE ON FUNCTION peek_invitation_email(text) TO anon, authenticated;
