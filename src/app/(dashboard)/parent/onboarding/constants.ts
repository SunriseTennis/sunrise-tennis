// Shared by the server-rendered router (page.tsx) and the client-side
// wizards. Must NOT be re-exported from a 'use client' file — Next.js
// App Router replaces non-component exports from client modules with
// client references when read on the server, which silently turned
// the step clamp into NaN. See debugging.md.
export const SELF_SIGNUP_TOTAL_STEPS = 6

// Plan 18 — admin-invite path now mirrors the self-signup wizard's
// iOS-aware A2HS + push UX, splitting the legacy combined Step 3
// into two steps (A2HS, then Push + T&C tick).
export const ADMIN_INVITE_TOTAL_STEPS = 4
