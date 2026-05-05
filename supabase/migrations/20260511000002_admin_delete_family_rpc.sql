-- Plan 21 — admin_delete_family RPC.
--
-- Hard-deletes a family ONLY when the row has zero operational
-- dependents. Counts blockers across every FK pointing at families(id)
-- and returns a structured response. The UI surfaces blockers; admin
-- decides whether to archive instead (status='archived').
--
-- Auto-clears: pending invitations, family_balance cache row, any
-- user_roles bound to this family. Auth.users rows are preserved
-- (separate concern; see debugging.md "Auth user delete blocked by FK").
--
-- Returns jsonb of shape:
--   { "success": bool, "blocked": bool, "deleted": bool, "blockers": jsonb }

CREATE OR REPLACE FUNCTION admin_delete_family(p_family_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists           boolean;
  v_players          integer;
  v_charges          integer;
  v_payments         integer;
  v_invoices         integer;
  v_bookings         integer;
  v_pricing          integer;
  v_messages         integer;
  v_referrals        integer;
  v_invites_claimed  integer;
  v_total            integer;
  v_blockers         jsonb := '{}'::jsonb;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT EXISTS(SELECT 1 FROM families WHERE id = p_family_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', false,
      'deleted', false,
      'error', 'Family not found'
    );
  END IF;

  -- Count rows pointing at this family.
  -- players: any row (active OR archived) — admin must clear them via
  -- admin_delete_player first. Archived players still hold history.
  SELECT COUNT(*) INTO v_players FROM players WHERE family_id = p_family_id;
  SELECT COUNT(*) INTO v_charges
    FROM charges WHERE family_id = p_family_id AND status <> 'voided';
  SELECT COUNT(*) INTO v_payments  FROM payments WHERE family_id = p_family_id;
  SELECT COUNT(*) INTO v_invoices  FROM invoices WHERE family_id = p_family_id;
  SELECT COUNT(*) INTO v_bookings
    FROM bookings WHERE family_id = p_family_id OR second_family_id = p_family_id;
  SELECT COUNT(*) INTO v_pricing   FROM family_pricing WHERE family_id = p_family_id;
  SELECT COUNT(*) INTO v_messages  FROM messages WHERE family_id = p_family_id;
  SELECT COUNT(*) INTO v_referrals
    FROM referrals
    WHERE referring_family_id = p_family_id OR referred_family_id = p_family_id;
  SELECT COUNT(*) INTO v_invites_claimed
    FROM invitations WHERE family_id = p_family_id AND status = 'claimed';

  IF v_players         > 0 THEN v_blockers := v_blockers || jsonb_build_object('players',         v_players);         END IF;
  IF v_charges         > 0 THEN v_blockers := v_blockers || jsonb_build_object('charges',         v_charges);         END IF;
  IF v_payments        > 0 THEN v_blockers := v_blockers || jsonb_build_object('payments',        v_payments);        END IF;
  IF v_invoices        > 0 THEN v_blockers := v_blockers || jsonb_build_object('invoices',        v_invoices);        END IF;
  IF v_bookings        > 0 THEN v_blockers := v_blockers || jsonb_build_object('bookings',        v_bookings);        END IF;
  IF v_pricing         > 0 THEN v_blockers := v_blockers || jsonb_build_object('family_pricing',  v_pricing);         END IF;
  IF v_messages        > 0 THEN v_blockers := v_blockers || jsonb_build_object('messages',        v_messages);        END IF;
  IF v_referrals       > 0 THEN v_blockers := v_blockers || jsonb_build_object('referrals',       v_referrals);       END IF;
  IF v_invites_claimed > 0 THEN v_blockers := v_blockers || jsonb_build_object('claimed_invites', v_invites_claimed); END IF;

  v_total := v_players + v_charges + v_payments + v_invoices + v_bookings
           + v_pricing + v_messages + v_referrals + v_invites_claimed;

  IF v_total > 0 THEN
    RETURN jsonb_build_object(
      'success',  false,
      'blocked',  true,
      'deleted',  false,
      'blockers', v_blockers
    );
  END IF;

  -- Safe to delete. Auto-clear transient junk in a deterministic order.
  DELETE FROM invitations  WHERE family_id = p_family_id AND status = 'pending';
  DELETE FROM family_balance WHERE family_id = p_family_id;
  DELETE FROM user_roles   WHERE family_id = p_family_id;
  DELETE FROM families     WHERE id = p_family_id;

  RETURN jsonb_build_object(
    'success',  true,
    'blocked',  false,
    'deleted',  true,
    'blockers', '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_family(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_family(uuid) TO authenticated;

COMMENT ON FUNCTION admin_delete_family(uuid) IS
  'Plan 21 — admin-only hard-delete with FK pre-flight. Returns blockers list if any operational rows point at the family; deletes safely otherwise. Auto-clears pending invitations, family_balance cache, and user_roles bound to this family. auth.users rows preserved.';
