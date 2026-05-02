-- Plan 10 — Private Lessons Overhaul (DB layer)
--
-- 1. SECURITY DEFINER helper `coach_can_read_player(coach_uid, player_id)`
--    that returns true when the coach has any non-cancelled booking on a
--    session they own that mentions this player. Used by an extended
--    coach players SELECT policy so the natural Supabase join from
--    `bookings` to `players` resolves for the coach.
--
-- 2. SECURITY DEFINER RPC `private_partner_summary(booking_ids uuid[])`
--    returning per-booking partner info. Auth gate: caller must own at
--    least one of the booking_ids OR be admin OR be the coach on every
--    listed session. Lets parents and coaches see the partner family's
--    player + family name without breaking RLS on cross-family rows.

-- ============================================================================
-- coach_can_read_player helper + extended players SELECT policy
-- ============================================================================

CREATE OR REPLACE FUNCTION coach_can_read_player(coach_uid uuid, target_player_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    WHERE b.player_id = target_player_id
      AND b.status <> 'cancelled'
      AND s.coach_id = get_user_coach_id(coach_uid)
  );
$$;

REVOKE ALL ON FUNCTION coach_can_read_player(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION coach_can_read_player(uuid, uuid) TO authenticated;

-- Replace the old narrow policy. The pre-existing one only allowed read when
-- `players.coach_id` (legacy preferred-coach field) matched the caller's
-- coach id. That breaks the natural join from bookings -> players for shared
-- (and even solo) privates whenever players.coach_id is NULL — which is the
-- default for almost every player in the system.

DROP POLICY IF EXISTS "coach_players_select" ON players;

CREATE POLICY "coach_players_select" ON players FOR SELECT
  USING (
    -- Legacy: explicit per-player coach assignment
    coach_id = get_user_coach_id(auth.uid())
    -- New: any non-cancelled booking on a session this coach owns
    OR coach_can_read_player(auth.uid(), id)
  );

-- ============================================================================
-- private_partner_summary RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION private_partner_summary(booking_ids uuid[])
RETURNS TABLE (
  booking_id uuid,
  partner_booking_id uuid,
  partner_player_id uuid,
  partner_first_name text,
  partner_last_name text,
  partner_family_id uuid,
  partner_family_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  caller_uid uuid := auth.uid();
  caller_family_id uuid;
  caller_coach_id uuid;
  caller_is_admin boolean;
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  caller_is_admin := is_admin(caller_uid);
  caller_family_id := get_user_family_id(caller_uid);
  caller_coach_id := get_user_coach_id(caller_uid);

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    pb.id AS partner_booking_id,
    pb.player_id AS partner_player_id,
    pp.first_name AS partner_first_name,
    pp.last_name AS partner_last_name,
    pf.id AS partner_family_id,
    pf.family_name AS partner_family_name
  FROM bookings b
  JOIN bookings pb ON pb.id = b.shared_with_booking_id
  JOIN players pp ON pp.id = pb.player_id
  JOIN families pf ON pf.id = pb.family_id
  LEFT JOIN sessions s ON s.id = b.session_id
  WHERE b.id = ANY(booking_ids)
    AND b.shared_with_booking_id IS NOT NULL
    AND (
      caller_is_admin
      OR (caller_family_id IS NOT NULL AND b.family_id = caller_family_id)
      OR (caller_coach_id IS NOT NULL AND s.coach_id = caller_coach_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION private_partner_summary(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION private_partner_summary(uuid[]) TO authenticated;

COMMENT ON FUNCTION private_partner_summary(uuid[]) IS
  'Plan 10: returns partner family/player info for shared private bookings. Auth: admin OR own family OR coach on the session.';

COMMENT ON FUNCTION coach_can_read_player(uuid, uuid) IS
  'Plan 10: extends coach players SELECT RLS so the natural join through bookings/sessions works for the coach.';
