-- Parents need to insert players into their own family during the self-signup
-- onboarding wizard (step 2) and via /parent/players/new (Plan 11). The original
-- 20260317000010_rls_policies.sql only granted players-INSERT to admins, which
-- is why the wizard returned `new row violates row-level security policy for
-- table "players"`. This adds the missing parent policy, family-scoped.
--
-- The booking gate (`requireApprovedFamily()` in src/lib/auth/require.ts)
-- enforces approval status separately at the action layer, so RLS does NOT
-- gate on approval — pending_review parents must be able to add players to
-- complete intake.

CREATE POLICY "parent_players_insert" ON players FOR INSERT
  WITH CHECK (family_id = get_user_family_id(auth.uid()));
