-- Increase early-bird discount from 10% to 15% for all active programs
UPDATE programs
SET early_pay_discount_pct = 15
WHERE status = 'active'
  AND early_pay_discount_pct = 10;
