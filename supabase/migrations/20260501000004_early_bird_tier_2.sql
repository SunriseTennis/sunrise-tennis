-- Migration: Set tiered early-bird discount on all non-school programs
-- - Tier 1: 15% until 2026-05-04 inclusive
-- - Tier 2: 10% from 2026-05-05 to 2026-05-10 inclusive
-- - After 2026-05-10: 0%
--
-- The enrolment server action picks the correct tier based on the
-- submission date (see src/lib/utils/billing.ts → getActiveEarlyBird).

UPDATE programs
SET early_pay_discount_pct      = 15,
    early_bird_deadline         = '2026-05-04',
    early_pay_discount_pct_tier2 = 10,
    early_bird_deadline_tier2    = '2026-05-10'
WHERE status = 'active'
  AND type   <> 'school';

-- School programs explicitly clear any leftover early-bird state.
UPDATE programs
SET early_pay_discount_pct       = NULL,
    early_bird_deadline          = NULL,
    early_pay_discount_pct_tier2 = NULL,
    early_bird_deadline_tier2    = NULL
WHERE type = 'school';
