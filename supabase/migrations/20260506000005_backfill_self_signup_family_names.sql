-- ─────────────────────────────────────────────────────────────────────────
-- Plan 17 Block C — pre-Block-B self-signups had family_name set to the
-- parent's full name (because the signup form only collected one field).
-- Block B changes new signups to use the surname; this corrects the two
-- existing self-signup rows. Idempotent — match keys filter to the exact
-- rows; re-running is a no-op.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE families
   SET family_name = 'Testing'
 WHERE family_name = 'Maxi Testing'
   AND signup_source = 'self_signup';

UPDATE families
   SET family_name = 'Wilson'
 WHERE family_name = 'Taryn Wilson'
   AND signup_source = 'self_signup';
