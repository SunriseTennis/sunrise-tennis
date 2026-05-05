-- Cache the Stripe Customer id per family so PaymentIntents can attach to a
-- Customer object (puts the parent's name + email on every PI in the Stripe
-- dashboard instead of "Guest"). Also the load-bearing column for the future
-- saved-cards work in Apps/Plans/08-saved-cards.md.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS families_stripe_customer_id_key
  ON families (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
