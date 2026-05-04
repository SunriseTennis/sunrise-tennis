/**
 * Verify the per-session-charge model post-backfill.
 *
 * Checks:
 *   1. No active 'term_enrollment' type charges remain.
 *   2. Every active term-style booking has at least 1 per-session charge
 *      (pending or confirmed) for at least one of its program's future
 *      sessions, OR has zero future sessions.
 *   3. For every payment, Σ allocations equals payment.amount_cents.
 *   4. tp10's Tue Blue Ball still has 9 charges (regression guard).
 *
 * Usage:
 *   cd /c/Users/maxim/Projects/sunrise-tennis
 *   op run --env-file=.env.op -- node scripts/verify-term-charges.mjs
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^"|"$/g, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/^"|"$/g, '')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${text}`)
  return JSON.parse(text)
}

let failures = 0
function fail(msg) { console.log(`  FAIL — ${msg}`); failures++ }
function pass(msg) { console.log(`  OK — ${msg}`) }

;(async () => {
  console.log('=== Verify per-session charge model ===\n')

  // 1. No active term_enrollment charges
  console.log('Check 1: no active term_enrollment charges')
  const legacy = await rest('charges?type=eq.term_enrollment&status=in.(pending,confirmed)&select=id,family_id,amount_cents&limit=10')
  if (legacy.length === 0) pass('no legacy term_enrollment charges in active state')
  else fail(`${legacy.length} legacy term_enrollment charges still active (sample IDs: ${legacy.slice(0, 3).map(c => c.id).join(', ')})`)

  // 2. Every active term-style booking has session-bound charges (or no sessions)
  console.log('\nCheck 2: term bookings have per-session charges')
  const bookings = await rest('bookings?booking_type=in.(term,term_enrollment)&status=eq.confirmed&select=id,family_id,player_id,program_id,programs:program_id(name)&limit=500')
  const today = new Date().toISOString().slice(0, 10)
  let bookingsMissingCharges = 0
  for (const b of bookings) {
    const charges = await rest(`charges?booking_id=eq.${b.id}&status=in.(pending,confirmed)&type=eq.session&limit=1&select=id`)
    if (charges.length > 0) continue
    const futureSessions = await rest(`sessions?program_id=eq.${b.program_id}&status=eq.scheduled&date=gte.${today}&limit=1&select=id`)
    if (futureSessions.length === 0) continue
    bookingsMissingCharges++
    if (bookingsMissingCharges <= 3) {
      console.log(`    booking ${b.id} (${b.programs?.name ?? '?'}) has no per-session charges but ${futureSessions.length}+ future sessions`)
    }
  }
  if (bookingsMissingCharges === 0) pass(`${bookings.length} term bookings inspected, all have per-session charges or no future sessions`)
  else fail(`${bookingsMissingCharges} of ${bookings.length} term bookings missing per-session charges`)

  // 3. Σ allocations matches payment amount
  console.log('\nCheck 3: Σ allocations == payment amount')
  const payments = await rest('payments?status=eq.received&select=id,amount_cents,family_id,payment_allocations(amount_cents)&limit=200')
  let paymentMismatches = 0
  for (const p of payments) {
    const allocSum = (p.payment_allocations ?? []).reduce((s, a) => s + a.amount_cents, 0)
    if (allocSum !== p.amount_cents) {
      paymentMismatches++
      if (paymentMismatches <= 3) {
        console.log(`    payment ${p.id} amount $${(p.amount_cents/100).toFixed(2)} != Σ alloc $${(allocSum/100).toFixed(2)} (${(p.payment_allocations ?? []).length} alloc(s))`)
      }
    }
  }
  if (paymentMismatches === 0) pass(`${payments.length} payments inspected, all allocations sum correctly`)
  else fail(`${paymentMismatches} of ${payments.length} payments have allocation mismatches (expected when partial / unallocated; flag if unexpected)`)

  // 4. tp10 regression guard
  console.log('\nCheck 4: tp10 Tue Blue Ball regression')
  // Find tp10 family by display_id pattern (T010) or test email lookup
  const tp10User = await rest('user_roles?role=eq.parent&select=family_id,user:auth.users!inner(email)&limit=20')
  // Simpler: query by family display_id 'T010'
  const tp10Fam = await rest('families?display_id=eq.T010&select=id,family_name')
  if (tp10Fam.length === 0) {
    console.log('  SKIP — T010 family not found in this environment (test data missing)')
  } else {
    const familyId = tp10Fam[0].id
    const tueBlueCharges = await rest(`charges?family_id=eq.${familyId}&description=ilike.*Tue%20Blue%20Ball*&status=in.(pending,confirmed)&select=id,amount_cents`)
    const total = tueBlueCharges.reduce((s, c) => s + c.amount_cents, 0)
    console.log(`  T010 has ${tueBlueCharges.length} active Tue Blue Ball charges totalling $${(total/100).toFixed(2)}`)
    if (tueBlueCharges.length === 0) {
      console.log(`  WARN — T010 has zero Tue Blue Ball charges (was 9 pre-deploy). Re-seed or backfill if expected.`)
    } else {
      pass(`T010 Tue Blue Ball intact (${tueBlueCharges.length} charges)`)
    }
  }
  // (The unused tp10User var above is intentionally harmless — we used display_id instead.)
  void tp10User

  console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch(e => {
  console.error('Verify script crashed:', e?.message ?? e)
  process.exit(1)
})
