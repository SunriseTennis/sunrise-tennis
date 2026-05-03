// Shared by the server-rendered router (page.tsx) and the client-side
// wizard (self-signup-wizard.tsx). Must NOT be re-exported from a
// 'use client' file — Next.js App Router replaces non-component exports
// from client modules with client references when read on the server,
// which silently turned the step clamp into NaN. See debugging.md.
export const SELF_SIGNUP_TOTAL_STEPS = 6
