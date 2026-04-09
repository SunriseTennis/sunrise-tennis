-- Migration: backfill any existing payments with payment_method='square' → 'stripe'.
-- Reason: payment processor swap from Square to Stripe (09-Apr-2026).
-- No-op in production (no rows yet); only affects sandbox seed data.

UPDATE payments SET payment_method = 'stripe' WHERE payment_method = 'square';
