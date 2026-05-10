-- ─────────────────────────────────────────────────────────────────────────
-- /admin/activity name resolution fix.
--
-- The previous get_user_directory() only read full_name from
-- auth.users.raw_user_meta_data, leaving Plan-20 admin-invite parents
-- (whose signupViaInvite path doesn't pass first/last/full_name into
-- user_metadata) and any user whose name was only ever written to
-- families.primary_contact / coaches.name showing as '-' in the admin
-- Users tab + activity feed.
--
-- This migration:
--   1. DROPs the old function (CREATE OR REPLACE can't widen the return
--      type — adding family_id + coach_id columns).
--   2. Re-creates it with a coalesce chain:
--        metadata.full_name  →  primary_contact.name  →  coaches.name
--   3. Returns the parent's family_id + coach role's coach_id so the
--      activity tab can render "Open family/coach page" buttons when
--      drilling into a specific user.
--
-- Admin-only (is_admin gate retained). No data mutation.
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_user_directory();

CREATE FUNCTION get_user_directory()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  roles text[],
  family_id uuid,
  coach_id uuid,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(trim(f.primary_contact->>'name'), ''),
      NULLIF(trim(c.name), ''),
      ''
    )::text AS full_name,
    COALESCE(
      ARRAY(
        SELECT ur.role FROM public.user_roles ur
         WHERE ur.user_id = u.id ORDER BY ur.role
      ),
      '{}'::text[]
    ) AS roles,
    (SELECT ur.family_id FROM public.user_roles ur
       WHERE ur.user_id = u.id AND ur.role = 'parent' AND ur.family_id IS NOT NULL
       LIMIT 1) AS family_id,
    (SELECT ur.coach_id FROM public.user_roles ur
       WHERE ur.user_id = u.id AND ur.role = 'coach' AND ur.coach_id IS NOT NULL
       LIMIT 1) AS coach_id,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until
  FROM auth.users u
  LEFT JOIN public.user_roles ur_p
    ON ur_p.user_id = u.id AND ur_p.role = 'parent'
  LEFT JOIN public.families f ON f.id = ur_p.family_id
  LEFT JOIN public.user_roles ur_c
    ON ur_c.user_id = u.id AND ur_c.role = 'coach'
  LEFT JOIN public.coaches c ON c.id = ur_c.coach_id
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_user_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_directory() TO authenticated;
