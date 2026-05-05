// Plan 20 — wipe-only test-account reset.
//
// Wipes the auth user, user_roles, invitations, and resets the
// family's onboarding state so a fresh invite walk-through works
// end-to-end. Keeps the family + players intact. Does NOT create
// a new invitation — admin uses the per-family invite form on
// /admin/families/[id] (or the InviteParentModal on /admin/families)
// to send the fresh invite, exercising the production path.
//
// Per debugging.md "Auth user delete blocked by FK" — auth.admin.deleteUser
// returns 500 when a row in audit_log / messages.sender_id / etc. still
// references the user. We try delete first; on failure we fall back
// to renaming the email to `archived+<timestamp>+<original>` so the
// original email is freed for re-signup.
//
// Usage:
//   op run --env-file=.env.op -- node scripts/reset-onboarding.mjs --display-id TPLN18-001                 # dry-run
//   op run --env-file=.env.op -- node scripts/reset-onboarding.mjs --display-id TPLN18-001 --apply         # apply
//   op run --env-file=.env.op -- node scripts/reset-onboarding.mjs --email admin+test@sunrisetennis.com.au # match by email instead

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing Supabase creds — run via op run --env-file=.env.op')
  process.exit(1)
}

const args = process.argv.slice(2)
function arg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 ? args[idx + 1] : undefined
}
const APPLY = args.includes('--apply')
const DISPLAY_ID = arg('display-id')
const EMAIL = arg('email')

if (!DISPLAY_ID && !EMAIL) {
  console.error('Required: --display-id <ID> OR --email <addr>')
  console.error('Optional: --apply  (otherwise dry-run)')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// ── 1. Locate the family ────────────────────────────────────────────────

let famQuery = sb.from('families').select('id, display_id, family_name, primary_contact')
if (DISPLAY_ID) {
  famQuery = famQuery.eq('display_id', DISPLAY_ID)
} else {
  // Match families whose primary_contact->>email matches the target.
  famQuery = famQuery.filter('primary_contact->>email', 'eq', EMAIL)
}

const { data: families, error: famErr } = await famQuery
if (famErr) {
  console.error('[reset] family lookup failed:', famErr)
  process.exit(1)
}

if (!families || families.length === 0) {
  console.error(`[reset] no family found for ${DISPLAY_ID ? `display_id=${DISPLAY_ID}` : `email=${EMAIL}`}`)
  // Try email lookup against auth.users + user_roles, in case the family
  // was already wiped but the auth user remains.
  if (EMAIL) {
    console.log('[reset] attempting orphaned-auth-user cleanup…')
    await cleanupOrphanedAuth(EMAIL)
  }
  process.exit(families ? 0 : 1)
}

if (families.length > 1) {
  console.error(`[reset] ${families.length} families matched — refusing to act on multiple. List:`)
  for (const f of families) console.error(`  ${f.display_id} — ${f.family_name}`)
  process.exit(1)
}

const fam = families[0]
console.log(`[reset] family ${fam.display_id} — ${fam.family_name} (${fam.id})`)

// ── 2. Inventory what will be touched ───────────────────────────────────

const [
  { data: roles },
  { data: invitations },
  { data: players },
] = await Promise.all([
  sb.from('user_roles').select('user_id, role').eq('family_id', fam.id),
  sb.from('invitations').select('id, email, status').eq('family_id', fam.id),
  sb.from('players').select('id, first_name, last_name').eq('family_id', fam.id),
])

console.log(`  user_roles:   ${roles?.length ?? 0}`)
console.log(`  invitations:  ${invitations?.length ?? 0} (${invitations?.map((i) => i.status).join(', ') || '—'})`)
console.log(`  players:      ${players?.length ?? 0} (kept, NOT deleted)`)

const authUserIds = new Set((roles ?? []).map((r) => r.user_id))
console.log(`  auth users:   ${authUserIds.size}`)
for (const uid of authUserIds) {
  const { data: u } = await sb.auth.admin.getUserById(uid)
  console.log(`    - ${uid} (${u?.user?.email ?? '?'})`)
}

if (!APPLY) {
  console.log('')
  console.log('[reset] DRY RUN — re-run with --apply to commit.')
  process.exit(0)
}

// ── 3. Apply ────────────────────────────────────────────────────────────

console.log('')
console.log('[reset] applying…')

// 3a. Delete user_roles for this family.
for (const r of roles ?? []) {
  const { error } = await sb.from('user_roles').delete().eq('user_id', r.user_id).eq('family_id', fam.id)
  if (error) console.error(`  user_roles delete (${r.user_id}):`, error.message)
}
console.log(`  ✓ deleted ${roles?.length ?? 0} user_roles`)

// 3b. Delete invitations.
for (const inv of invitations ?? []) {
  const { error } = await sb.from('invitations').delete().eq('id', inv.id)
  if (error) console.error(`  invitation delete (${inv.id}):`, error.message)
}
console.log(`  ✓ deleted ${invitations?.length ?? 0} invitations`)

// 3c. Delete (or rename) the auth users.
for (const uid of authUserIds) {
  const { data: u } = await sb.auth.admin.getUserById(uid)
  const origEmail = u?.user?.email
  const { error: delErr } = await sb.auth.admin.deleteUser(uid)
  if (!delErr) {
    console.log(`  ✓ deleted auth user ${uid} (${origEmail})`)
    continue
  }

  // FK trap — fall back to email rename so the original is freed.
  console.log(`  auth.delete blocked (${delErr.message}) — renaming email instead`)
  const stamped = `archived+${Date.now()}+${origEmail ?? uid}`.replace(/[^A-Za-z0-9@._+-]/g, '-')
  const { error: renErr } = await sb.auth.admin.updateUserById(uid, {
    email: stamped,
    email_confirm: true,
  })
  if (renErr) {
    console.error(`  ✗ rename also failed (${uid}):`, renErr.message)
  } else {
    console.log(`  ✓ renamed auth user ${uid} → ${stamped}`)
  }
}

// 3d. Reset family onboarding state.
const { error: famUpdErr } = await sb
  .from('families')
  .update({
    completed_onboarding: false,
    terms_acknowledged_at: null,
    approved_at: null,
    welcome_banner_dismissed_at: null,
  })
  .eq('id', fam.id)
if (famUpdErr) {
  console.error(`  family state reset failed:`, famUpdErr.message)
} else {
  console.log(`  ✓ reset family onboarding state`)
}

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(' WIPE COMPLETE')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  Family:   ${fam.display_id} — ${fam.family_name}`)
console.log(`  Players:  ${players?.length ?? 0} kept`)
console.log('')
console.log(`  Next: open /admin/families/${fam.id} and click "Send invite link"`)
console.log(`  (or use the InviteParentModal on /admin/families).`)
console.log(`  Resend will email the branded invite — click through to test.`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// ── Helpers ─────────────────────────────────────────────────────────────

async function cleanupOrphanedAuth(email) {
  // Fall-back path when the family is gone but the auth user lingers.
  // Iterate auth.users via the admin API (paginated).
  const lower = email.toLowerCase()
  let page = 1
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      console.error('  auth.listUsers failed:', error.message)
      return
    }
    const matches = data.users.filter((u) => (u.email ?? '').toLowerCase() === lower)
    for (const u of matches) {
      console.log(`  found orphaned auth user ${u.id} (${u.email})`)
      if (!APPLY) continue
      const { error: delErr } = await sb.auth.admin.deleteUser(u.id)
      if (delErr) {
        const stamped = `archived+${Date.now()}+${u.email ?? u.id}`.replace(/[^A-Za-z0-9@._+-]/g, '-')
        await sb.auth.admin.updateUserById(u.id, { email: stamped, email_confirm: true })
        console.log(`  renamed → ${stamped}`)
      } else {
        console.log(`  deleted`)
      }
    }
    if (data.users.length < 1000) break
    page += 1
  }
}
