-- Migration 006: Security hardening round 2
-- Fixes: RPC authorization, invitations policy, parent column restrictions,
-- medical notes decryption view, coach attendance policies

-- ============================================================================
-- 1. Secure get_player_medical_notes — add authorization check
-- ============================================================================

CREATE OR REPLACE FUNCTION get_player_medical_notes(p_player_id uuid)
RETURNS TABLE(medical_notes text, physical_notes text) AS $$
  SELECT
    decrypt_medical(p.medical_notes) as medical_notes,
    decrypt_medical(p.physical_notes) as physical_notes
  FROM players p
  WHERE p.id = p_player_id
    AND (
      -- Admin can see all
      is_admin(auth.uid())
      -- Parent can see their own family's players
      OR p.family_id = get_user_family_id(auth.uid())
      -- Coach can see their assigned players
      OR p.coach_id = get_user_coach_id(auth.uid())
      -- Coach can see players in their programs
      OR p.id IN (
        SELECT pr.player_id FROM program_roster pr
        JOIN program_coaches pc ON pc.program_id = pr.program_id
        WHERE pc.coach_id = get_user_coach_id(auth.uid())
        AND pr.status = 'enrolled'
      )
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- 2. Secure recalculate_family_balance — admin or own family only
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_family_balance(target_family_id uuid)
RETURNS integer AS $$
DECLARE
  total_payments integer;
  total_charges integer;
  new_balance integer;
BEGIN
  -- Authorization: admin or the family's own parent
  IF NOT is_admin(auth.uid()) AND get_user_family_id(auth.uid()) != target_family_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0)
  INTO total_payments
  FROM payments
  WHERE family_id = target_family_id
    AND status = 'received';

  SELECT COALESCE(SUM(amount_cents), 0)
  INTO total_charges
  FROM charges
  WHERE family_id = target_family_id
    AND status IN ('pending', 'confirmed');

  new_balance := total_payments - total_charges;

  INSERT INTO family_balance (family_id, balance_cents, last_updated)
  VALUES (target_family_id, new_balance, now())
  ON CONFLICT (family_id) DO UPDATE
  SET balance_cents = new_balance, last_updated = now();

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. Secure get_session_price — admin or own family only
-- ============================================================================

CREATE OR REPLACE FUNCTION get_session_price(
  target_family_id uuid,
  target_program_id uuid,
  target_program_type text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  override_price integer;
  program_price integer;
BEGIN
  -- Authorization: admin or the family's own parent
  IF NOT is_admin(auth.uid()) AND get_user_family_id(auth.uid()) != target_family_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT fp.per_session_cents INTO override_price
  FROM family_pricing fp
  WHERE fp.family_id = target_family_id
    AND fp.program_id = target_program_id
    AND fp.valid_from <= CURRENT_DATE
    AND (fp.valid_until IS NULL OR fp.valid_until >= CURRENT_DATE)
  ORDER BY fp.created_at DESC
  LIMIT 1;

  IF override_price IS NOT NULL THEN
    RETURN override_price;
  END IF;

  IF target_program_type IS NOT NULL THEN
    SELECT fp.per_session_cents INTO override_price
    FROM family_pricing fp
    WHERE fp.family_id = target_family_id
      AND fp.program_id IS NULL
      AND fp.program_type = target_program_type
      AND fp.valid_from <= CURRENT_DATE
      AND (fp.valid_until IS NULL OR fp.valid_until >= CURRENT_DATE)
    ORDER BY fp.created_at DESC
    LIMIT 1;

    IF override_price IS NOT NULL THEN
      RETURN override_price;
    END IF;
  END IF;

  SELECT p.per_session_cents INTO program_price
  FROM programs p
  WHERE p.id = target_program_id;

  RETURN COALESCE(program_price, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- 4. Secure get_term_price — admin or own family only
-- ============================================================================

CREATE OR REPLACE FUNCTION get_term_price(
  target_family_id uuid,
  target_program_id uuid,
  target_program_type text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  override_price integer;
  program_price integer;
BEGIN
  -- Authorization: admin or the family's own parent
  IF NOT is_admin(auth.uid()) AND get_user_family_id(auth.uid()) != target_family_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT fp.term_fee_cents INTO override_price
  FROM family_pricing fp
  WHERE fp.family_id = target_family_id
    AND fp.program_id = target_program_id
    AND fp.valid_from <= CURRENT_DATE
    AND (fp.valid_until IS NULL OR fp.valid_until >= CURRENT_DATE)
  ORDER BY fp.created_at DESC
  LIMIT 1;

  IF override_price IS NOT NULL THEN
    RETURN override_price;
  END IF;

  IF target_program_type IS NOT NULL THEN
    SELECT fp.term_fee_cents INTO override_price
    FROM family_pricing fp
    WHERE fp.family_id = target_family_id
      AND fp.program_id IS NULL
      AND fp.program_type = target_program_type
      AND fp.valid_from <= CURRENT_DATE
      AND (fp.valid_until IS NULL OR fp.valid_until >= CURRENT_DATE)
    ORDER BY fp.created_at DESC
    LIMIT 1;

    IF override_price IS NOT NULL THEN
      RETURN override_price;
    END IF;
  END IF;

  SELECT p.term_fee_cents INTO program_price
  FROM programs p
  WHERE p.id = target_program_id;

  RETURN COALESCE(program_price, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- 5. Fix invitations SELECT policy — scope to own email or admin
-- ============================================================================

DROP POLICY IF EXISTS "public_invitations_select_by_token" ON invitations;

-- Authenticated users can only see invitations addressed to their own email
CREATE POLICY "user_invitations_select_own" ON invitations FOR SELECT
  USING (
    email = (auth.jwt()->>'email')
    OR is_admin(auth.uid())
  );

-- ============================================================================
-- 6. Restrict parent UPDATE on players — allowed columns only
-- ============================================================================

-- Replace the unrestricted parent_players_update policy with a trigger
-- that enforces which columns parents can modify.

CREATE OR REPLACE FUNCTION enforce_parent_player_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If the caller is not admin, block changes to coaching/status fields
  IF NOT is_admin(auth.uid()) THEN
    -- Preserve admin-controlled fields
    NEW.level := OLD.level;
    NEW.ball_color := OLD.ball_color;
    NEW.coach_id := OLD.coach_id;
    NEW.status := OLD.status;
    NEW.current_focus := OLD.current_focus;
    NEW.short_term_goal := OLD.short_term_goal;
    NEW.long_term_goal := OLD.long_term_goal;
    NEW.comp_interest := OLD.comp_interest;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_parent_player_columns
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION enforce_parent_player_update();

-- ============================================================================
-- 7. Restrict parent UPDATE on families — allowed columns only
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_parent_family_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If the caller is not admin, block changes to admin-controlled fields
  IF NOT is_admin(auth.uid()) THEN
    NEW.status := OLD.status;
    NEW.display_id := OLD.display_id;
    NEW.billing_prefs := OLD.billing_prefs;
    NEW.referred_by := OLD.referred_by;
    NEW.notes := OLD.notes;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_parent_family_columns
  BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION enforce_parent_family_update();

-- ============================================================================
-- 8. Add coach UPDATE policy on attendances (needed for upsert)
-- ============================================================================

CREATE POLICY "coach_attendances_update" ON attendances FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE coach_id = get_user_coach_id(auth.uid())
    )
  );

-- ============================================================================
-- 9. Add coach UPDATE policy on sessions (to mark completed)
-- ============================================================================

CREATE POLICY "coach_sessions_update_status" ON sessions FOR UPDATE
  USING (coach_id = get_user_coach_id(auth.uid()));

-- ============================================================================
-- 10. create_booking_notification — replaces service role usage in parent actions
--     Allows parents to create booking notifications for their own family only.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_booking_notification(
  p_type text,
  p_title text,
  p_body text,
  p_url text,
  p_family_id uuid
)
RETURNS uuid AS $$
DECLARE
  calling_user uuid := auth.uid();
  notification_id uuid;
BEGIN
  -- Authorization: must be the family's parent or admin
  IF NOT is_admin(calling_user) AND get_user_family_id(calling_user) != p_family_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO notifications (type, title, body, url, target_type, target_id, created_by)
  VALUES (p_type, p_title, p_body, p_url, 'family', p_family_id, calling_user)
  RETURNING id INTO notification_id;

  INSERT INTO notification_recipients (notification_id, user_id)
  VALUES (notification_id, calling_user);

  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
