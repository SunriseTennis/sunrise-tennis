-- Extend tier-1 early-bird deadline by one day (04-May → 05-May 2026).
-- 03-May-2026: Maxim wanted bookings made today, Mon 04-May, and Tue 05-May
-- to all get 15%; from Wed 06-May through Sun 10-May they get 10% (tier 2).
-- Tier-2 deadline (2026-05-10) unchanged.

UPDATE programs
SET early_bird_deadline = '2026-05-05'
WHERE status = 'active'
  AND early_pay_discount_pct = 15
  AND early_bird_deadline = '2026-05-04';
