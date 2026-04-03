-- Add early_bird_deadline column to programs
-- and set 10% early bird discount for group programs (Term 2 2026)

ALTER TABLE programs ADD COLUMN IF NOT EXISTS early_bird_deadline date;

-- Set early bird discount for all active group programs
UPDATE programs
SET early_pay_discount_pct = 10,
    early_bird_deadline = '2026-04-21'
WHERE type = 'group'
  AND status = 'active'
  AND (early_pay_discount_pct IS NULL OR early_pay_discount_pct = 0);
