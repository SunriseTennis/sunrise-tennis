// Identifies seed/test accounts so admin views can hide them from "real activity"
// surfaces. Patterns track scripts/seed-test-data.mjs and friends — update if
// the seed-script email patterns change.

export function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  if (e.endsWith('@sunrise.test')) return true
  if (/^t[pca]\d+@/.test(e)) return true
  if (/^test[._-]/.test(e)) return true
  return false
}
