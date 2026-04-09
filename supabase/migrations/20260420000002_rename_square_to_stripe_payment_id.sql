-- Migration: rename payments.square_payment_id → stripe_payment_intent_id
-- Reason: payment processor swap from Square to Stripe (09-Apr-2026).
-- Safe because sandbox-only data; no production payments exist yet.

ALTER TABLE payments
  RENAME COLUMN square_payment_id TO stripe_payment_intent_id;

COMMENT ON COLUMN payments.stripe_payment_intent_id IS
  'Stripe PaymentIntent id (pi_...). Nullable for non-card payments.';
