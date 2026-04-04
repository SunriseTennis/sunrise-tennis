-- Migration: Dual Balance + Payment Allocations
-- Adds confirmed/projected balance split, payment-charge linking,
-- payment voiding support, and FIFO allocation logic.

-- ============================================================================
-- 1. Extend family_balance with dual columns
-- ============================================================================

ALTER TABLE family_balance
  ADD COLUMN IF NOT EXISTS confirmed_balance_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS projected_balance_cents integer NOT NULL DEFAULT 0;

-- ============================================================================
-- 2. Create payment_allocations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  charge_id uuid NOT NULL REFERENCES charges(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_charge ON payment_allocations(charge_id);

-- ============================================================================
-- 3. Soft-delete support for payments
-- ============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id);

-- ============================================================================
-- 4. Replace recalculate_family_balance() with dual-balance version
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_family_balance(target_family_id uuid)
RETURNS integer AS $$
DECLARE
  total_payments integer;
  total_all_charges integer;
  total_confirmed_charges integer;
  new_projected integer;
  new_confirmed integer;
BEGIN
  -- Sum all received payments
  SELECT COALESCE(SUM(amount_cents), 0)
  INTO total_payments
  FROM payments
  WHERE family_id = target_family_id
    AND status = 'received';

  -- Projected: ALL active charges (pending + confirmed)
  SELECT COALESCE(SUM(amount_cents), 0)
  INTO total_all_charges
  FROM charges
  WHERE family_id = target_family_id
    AND status IN ('pending', 'confirmed');

  -- Confirmed: only charges linked to completed sessions,
  -- OR charges with no session_id (admin adjustments, term fees, credits, etc.)
  SELECT COALESCE(SUM(c.amount_cents), 0)
  INTO total_confirmed_charges
  FROM charges c
  LEFT JOIN sessions s ON c.session_id = s.id
  WHERE c.family_id = target_family_id
    AND c.status IN ('pending', 'confirmed')
    AND (c.session_id IS NULL OR s.status = 'completed');

  new_projected := total_payments - total_all_charges;
  new_confirmed := total_payments - total_confirmed_charges;

  INSERT INTO family_balance (family_id, balance_cents, confirmed_balance_cents, projected_balance_cents, last_updated)
  VALUES (target_family_id, new_projected, new_confirmed, new_projected, now())
  ON CONFLICT (family_id) DO UPDATE
  SET balance_cents = new_projected,
      confirmed_balance_cents = new_confirmed,
      projected_balance_cents = new_projected,
      last_updated = now();

  RETURN new_projected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. FIFO payment allocation function
-- ============================================================================

CREATE OR REPLACE FUNCTION allocate_payment_to_charges(target_payment_id uuid)
RETURNS void AS $$
DECLARE
  remaining integer;
  pay_family uuid;
  charge_row RECORD;
  unallocated integer;
  alloc integer;
BEGIN
  -- Get payment details
  SELECT amount_cents, family_id INTO remaining, pay_family
  FROM payments
  WHERE id = target_payment_id AND status = 'received';

  IF remaining IS NULL OR remaining <= 0 THEN RETURN; END IF;

  -- Clear existing allocations for this payment (supports re-allocation)
  DELETE FROM payment_allocations WHERE payment_id = target_payment_id;

  -- Walk charges oldest-first, allocate until payment is exhausted
  FOR charge_row IN
    SELECT
      c.id,
      c.amount_cents,
      COALESCE(
        (SELECT SUM(pa.amount_cents) FROM payment_allocations pa WHERE pa.charge_id = c.id),
        0
      ) AS already_allocated
    FROM charges c
    WHERE c.family_id = pay_family
      AND c.status IN ('pending', 'confirmed')
      AND c.amount_cents > 0
    ORDER BY c.created_at ASC
  LOOP
    EXIT WHEN remaining <= 0;

    unallocated := charge_row.amount_cents - charge_row.already_allocated;
    IF unallocated <= 0 THEN CONTINUE; END IF;

    alloc := LEAST(remaining, unallocated);

    INSERT INTO payment_allocations (payment_id, charge_id, amount_cents)
    VALUES (target_payment_id, charge_row.id, alloc);

    remaining := remaining - alloc;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. RLS for payment_allocations
-- ============================================================================

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_payment_allocations_all" ON payment_allocations
  FOR ALL USING (is_admin(auth.uid()));

-- Parent: read allocations for their own family's payments
CREATE POLICY "parent_payment_allocations_select" ON payment_allocations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = payment_allocations.payment_id
        AND p.family_id = get_user_family_id(auth.uid())
    )
  );

-- ============================================================================
-- 7. Backfill: recalculate all family balances with new dual columns
-- ============================================================================

DO $$
DECLARE
  fam RECORD;
BEGIN
  FOR fam IN SELECT DISTINCT family_id FROM family_balance LOOP
    PERFORM recalculate_family_balance(fam.family_id);
  END LOOP;
END $$;

-- Also backfill for families that may not have a balance row yet
DO $$
DECLARE
  fam RECORD;
BEGIN
  FOR fam IN
    SELECT id FROM families
    WHERE id NOT IN (SELECT family_id FROM family_balance)
  LOOP
    PERFORM recalculate_family_balance(fam.id);
  END LOOP;
END $$;

-- Backfill payment allocations for existing received payments
DO $$
DECLARE
  pay RECORD;
BEGIN
  FOR pay IN
    SELECT id FROM payments
    WHERE status = 'received'
    ORDER BY COALESCE(received_at, created_at) ASC
  LOOP
    PERFORM allocate_payment_to_charges(pay.id);
  END LOOP;
END $$;
