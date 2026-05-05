// Shared by the server-rendered router (page.tsx) and the client-side
// wizards. Must NOT be re-exported from a 'use client' file — Next.js
// App Router replaces non-component exports from client modules with
// client references when read on the server, which silently turned
// the step clamp into NaN. See debugging.md.
export const SELF_SIGNUP_TOTAL_STEPS = 6

// Plan 20 — Plan 19 added Step 3 Terms+Consent which bumped the
// admin-invite wizard from 4 to 5 rendered steps, but this constant
// was never updated. Result: advancePastA2HS()'s redirect to ?step=6
// clamped back to step=4 (A2HS) and trapped the parent in a re-render
// loop. Bumped to 5 here, and advancePastA2HS rewritten to redirect
// explicitly per signup_source so a future drift can't recreate it.
//
// Plan 18 — admin-invite path mirrors the self-signup wizard's
// iOS-aware A2HS + push UX (each in its own step).
export const ADMIN_INVITE_TOTAL_STEPS = 5
