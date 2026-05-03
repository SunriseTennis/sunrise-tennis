#!/usr/bin/env node
/**
 * Plan 15 Phase B.0 — Backfill orphan auth.users into the new approval queue.
 *
 * Context: before Plan 15 shipped, parents who signed up at /signup with no
 * invite link landed on a dead-end /dashboard card and got no role assigned.
 * They sit as auth.users with no user_role and no family. The audit on
 * 04-May-2026 surfaced 1 such real lead (Taryn Wilson, 8 days waiting) plus
 * a typo'd unconfirmed attempt and a system account.
 *
 * This script finds confirmed orphans, classifies them, and lets you opt to
 * convert each one into a `pending_review` family + parent role so they
 * appear in /admin/approvals. After Phase B ships, /dashboard auto-creates
 * the family for new self-signups so this won't happen again — this script
 * is a one-shot for the existing backlog.
 *
 * Usage:
 *   op run --env-file=.env.op -- node scripts/backfill-orphan-signups.mjs --dry-run
 *   op run --env-file=.env.op -- node scripts/backfill-orphan-signups.mjs --apply
 *
 * Behaviour:
 *   --dry-run (default)  — print the audit table, do not write anything.
 *   --apply              — for each confirmed orphan, prompt y/n/skip
 *                          via a hardcoded allowlist (see CONVERT_LIST below).
 *                          If the auth user is in CONVERT_LIST, create the
 *                          pending_review family + parent role.
 *
 * Idempotent: re-running is safe. An auth user that already has a role is
 * never touched.
 *
 * The allowlist approach is intentional — we DON'T want to auto-convert
 * every orphan (some are system accounts like admin@). Edit CONVERT_LIST
 * before running with --apply.
 */

import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

// Allowlist of auth user emails to convert into pending_review families.
// Add an email here to opt it in. Anything NOT in this list is skipped.
const CONVERT_LIST = new Set([
  'tarynewilson@hotmail.com',
])

// Skip list — these are known system / non-parent accounts. Documented here
// so future runs of the script don't re-flag them.
const SKIP_LIST = new Set([
  'admin@sunrisetennis.com.au', // Workspace login, not a parent
  'taynewilson@hotmail.com',    // typo of taryne, never confirmed
])

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

async function findOrphans() {
  const { data: usersPage, error: ue } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (ue) throw ue
  const { data: roles, error: re } = await sb.from('user_roles').select('user_id')
  if (re) throw re
  const haveRole = new Set((roles ?? []).map(r => r.user_id))
  return usersPage.users.filter(u => !haveRole.has(u.id))
}

function classify(u) {
  const email = u.email ?? ''
  if (CONVERT_LIST.has(email)) return 'CONVERT'
  if (SKIP_LIST.has(email))     return 'SKIP_KNOWN'
  if (!u.email_confirmed_at)    return 'SKIP_UNCONFIRMED'
  return 'NEEDS_REVIEW' // confirmed but not opted-in — surface so we can decide
}

function describe(u) {
  const meta = u.user_metadata ?? {}
  const name = meta.full_name ?? '(no name)'
  const confirmed = u.email_confirmed_at ? 'Y' : 'N'
  const created = u.created_at?.slice(0, 10) ?? '?'
  return `${u.email.padEnd(34)} confirmed=${confirmed}  created=${created}  name="${name}"`
}

async function convertOrphan(u) {
  const meta = u.user_metadata ?? {}
  const name = meta.full_name ?? u.email ?? 'New family'

  // We can't call create_self_signup_family directly (it uses auth.uid())
  // so we replicate the logic with the service role.
  // 1. Allocate a unique S### display_id.
  const { data: maxRow } = await sb
    .from('families')
    .select('display_id')
    .like('display_id', 'S%')
    .order('display_id', { ascending: false })
    .limit(1)
    .maybeSingle()

  const next = maxRow?.display_id ? parseInt(maxRow.display_id.slice(1), 10) + 1 : 1
  const displayId = 'S' + String(next).padStart(3, '0')

  // 2. Insert family in pending_review state, with a backfill note.
  const { data: family, error: fe } = await sb
    .from('families')
    .insert({
      display_id: displayId,
      family_name: name,
      primary_contact: { name, email: u.email },
      approval_status: 'pending_review',
      signup_source: 'self_signup',
      status: 'active',
      notes: `Backfilled by Plan 15 Phase B.0 on ${new Date().toISOString().slice(0, 10)} — original signup ${u.created_at?.slice(0, 10)}, was orphaned for ${Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86400000)} days.`,
    })
    .select('id, display_id')
    .single()
  if (fe) throw fe

  // 3. Bind the auth user as parent.
  const { error: re } = await sb
    .from('user_roles')
    .insert({ user_id: u.id, role: 'parent', family_id: family.id })
  if (re) {
    // rollback the family insert if we can
    await sb.from('families').delete().eq('id', family.id)
    throw re
  }

  return family
}

async function main() {
  console.log(`\n  ${APPLY ? 'APPLY' : 'DRY-RUN'} — backfill orphan signups\n  ` + '─'.repeat(72))

  const orphans = await findOrphans()
  if (orphans.length === 0) {
    console.log('\n  No orphan auth users. Nothing to do.\n')
    return
  }

  const buckets = { CONVERT: [], SKIP_KNOWN: [], SKIP_UNCONFIRMED: [], NEEDS_REVIEW: [] }
  for (const u of orphans) buckets[classify(u)].push(u)

  for (const [bucket, users] of Object.entries(buckets)) {
    if (users.length === 0) continue
    console.log(`\n  [${bucket}]  (${users.length})`)
    for (const u of users) console.log('    ' + describe(u))
  }

  if (buckets.NEEDS_REVIEW.length > 0) {
    console.log(`\n  ⚠ ${buckets.NEEDS_REVIEW.length} confirmed orphan(s) NOT in CONVERT_LIST or SKIP_LIST.`)
    console.log('    Edit CONVERT_LIST or SKIP_LIST in this script and re-run.')
  }

  if (!APPLY) {
    console.log(`\n  Dry-run complete. ${buckets.CONVERT.length} would be converted to pending_review.`)
    console.log('  Re-run with --apply to actually create the families.\n')
    return
  }

  // APPLY mode — convert everything in CONVERT bucket.
  console.log(`\n  Converting ${buckets.CONVERT.length} orphan(s)...\n`)
  const dispatchUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.sunrisetennis.com.au'

  for (const u of buckets.CONVERT) {
    try {
      const fam = await convertOrphan(u)
      console.log(`    ✓ ${u.email}  →  ${fam.display_id}  (${fam.id})`)

      // Don't fire admin notification for backfill — Maxim already knows
      // about Taryn (he handled her personally per the conversation note).
      // The admin queue will surface her on next page load anyway.
      void dispatchUrl
    } catch (e) {
      console.log(`    ✗ ${u.email}  —  ${e.message ?? e}`)
    }
  }

  console.log('\n  Done. Check /admin/approvals.\n')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
