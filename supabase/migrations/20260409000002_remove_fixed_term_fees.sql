-- Remove fixed term fees - term pricing is now always calculated as
-- per_session_cents * remaining_sessions
UPDATE programs SET term_fee_cents = NULL;
