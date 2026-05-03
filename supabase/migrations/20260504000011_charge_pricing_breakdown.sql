-- Charges: pricing_breakdown JSONB
--
-- Stores the itemised breakdown that produced each charge's amount_cents.
-- Drives the "why is it $X?" expandable section on /parent/payments and the
-- multi-line price display on the enrol form. Future Discount Centre stats
-- will read from this column instead of suffix-matching the description.
--
-- Shape (JSONB, all keys optional except total_cents):
-- {
--   "sessions": 9,
--   "per_session_cents": 3000,
--   "subtotal_cents": 27000,
--   "morning_squad_partner_applied": false,
--   "multi_group_pct": 25,
--   "multi_group_cents_off": 6750,
--   "early_bird_pct": 10,
--   "early_bird_cents_off": 2025,
--   "total_cents": 18225
-- }

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS pricing_breakdown jsonb;

COMMENT ON COLUMN charges.pricing_breakdown IS
  'Itemised breakdown that produced amount_cents (sessions, per-session, discounts applied, total). Read by parent payments breakdown panel and Discount Centre usage stats.';
