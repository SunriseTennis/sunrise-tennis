/**
 * Backfill: convert term enrolments to the per-session-charge model.
 *
 * Two modes are handled (both idempotent):
 *
 *   1. PAY-LATER bookings with zero per-session charges. Create N pending
 *      per-session charges for every FUTURE scheduled session.
 *
 *   2. PAY-NOW bookings carrying a single legacy `type='term_enrollment'`
 *      charge + one allocation. Split into N confirmed per-session charges
 *      summing to the same amount; create N allocations replacing the one;
 *      void the original term_enrollment charge.
 *
 * Idempotency markers:
 *   - PAY-LATER pass: skip if any per-session charge already exists for the
 *     (booking_id, session_id) pair. New charges land for sessions missing a
 *     charge.
 *   - PAY-NOW pass: skip booking if `bookings.notes` contains
 *     `[backfill_split:done]`. After successful split, the marker is appended.
 *
 * Usage:
 *   cd /c/Users/maxim/Projects/sunrise-tennis
 *   op run --env-file=.env.op -- node scripts/backfill-term-session-charges.mjs --dry-run
 *   op run --env-file=.env.op -- node scripts/backfill-term-session-charges.mjs --apply [--family-id=<uuid>] [--booking-id=<uuid>]
 *
 * Filter flags target a single family or a single booking — useful for the
 * "test on 1 record first" guarantee from .claude/rules/context-protocol.md.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^"|"$/g, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/^"|"$/g, '')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DRY_RUN = !APPLY
const FAMILY_FILTER = args.find(a => a.startsWith('--family-id='))?.split('=')[1] ?? null
const BOOKING_FILTER = args.find(a => a.startsWith('--booking-id='))?.split('=')[1] ?? null

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${FAMILY_FILTER ? ` (family ${FAMILY_FILTER})` : ''}${BOOKING_FILTER ? ` (booking ${BOOKING_FILTER})` : ''}`)

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

async function rpc(fn, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params ?? {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`rpc/${fn} -> ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

function termLabel(date) {
  const d = date instanceof Date ? date : new Date(date)
  const TERMS = [
    { label: 'Term 1 2026', start: '2026-01-27', end: '2026-04-11' },
    { label: 'Term 2 2026', start: '2026-04-28', end: '2026-07-04' },
    { label: 'Term 3 2026', start: '2026-07-21', end: '2026-09-26' },
    { label: 'Term 4 2026', start: '2026-10-13', end: '2026-12-12' },
  ]
  const iso = d.toISOString().slice(0, 10)
  for (const t of TERMS) if (iso >= t.start && iso <= t.end) return t.label
  for (const t of TERMS) if (iso < t.start) return t.label
  return 'Term'
}

function buildBreakdown({ basePriceCents, perSessionPriceCents, multiGroupApplied, earlyBirdPct, sessions }) {
  const n = sessions ?? 1
  const subtotal = basePriceCents * n
  const multiOff = multiGroupApplied ? subtotal - perSessionPriceCents * n : 0
  const afterMulti = subtotal - multiOff
  const ebOff = earlyBirdPct > 0 ? Math.round(afterMulti * (earlyBirdPct / 100)) : 0
  const total = afterMulti - ebOff
  const out = {
    sessions: n,
    per_session_cents: basePriceCents,
    subtotal_cents: subtotal,
    morning_squad_partner_applied: false,
    total_cents: total,
  }
  if (multiGroupApplied) {
    out.multi_group_pct = 25
    out.multi_group_cents_off = multiOff
  }
  if (earlyBirdPct > 0) {
    out.early_bird_pct = earlyBirdPct
    out.early_bird_cents_off = ebOff
  }
  return out
}

// ── PAY-LATER pass ────────────────────────────────────────────────────────

async function payLaterPass() {
  console.log('\n=== PAY-LATER pass ===')
  let bookingFilter = `booking_type=in.(term,term_enrollment)&payment_option=eq.pay_later&status=eq.confirmed`
  if (FAMILY_FILTER) bookingFilter += `&family_id=eq.${FAMILY_FILTER}`
  if (BOOKING_FILTER) bookingFilter += `&id=eq.${BOOKING_FILTER}`

  const bookings = await rest('GET',
    `bookings?${bookingFilter}&select=id,family_id,player_id,program_id,booked_by,programs:program_id(id,name,type,early_pay_discount_pct,early_bird_deadline,early_pay_discount_pct_tier2,early_bird_deadline_tier2),players:player_id(first_name)`,
  )
  console.log(`Pay-later term bookings to inspect: ${bookings.length}`)

  let chargesCreated = 0
  for (const b of bookings) {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = await rest('GET',
      `sessions?program_id=eq.${b.program_id}&status=eq.scheduled&date=gte.${today}&order=date.asc&select=id,date`,
    )
    if (sessions.length === 0) continue

    // Skip sessions that already have a per-session charge for this player
    const existing = await rest('GET',
      `charges?booking_id=eq.${b.id}&family_id=eq.${b.family_id}&player_id=eq.${b.player_id}&status=in.(pending,confirmed)&select=session_id`,
    )
    const haveSet = new Set(existing.map(c => c.session_id).filter(Boolean))
    const missing = sessions.filter(s => !haveSet.has(s.id))
    if (missing.length === 0) continue

    // Per-session price + active early-bird (per-session is what populates breakdown.basePrice)
    const perSession = await rpc('get_session_price', {
      target_family_id: b.family_id,
      target_program_id: b.program_id,
      target_program_type: b.programs?.type ?? null,
    })
    const basePrice = Number(perSession ?? 0)
    if (basePrice <= 0) continue

    let earlyPct = 0
    const todayIso = new Date().toISOString().slice(0, 10)
    if (b.programs?.early_pay_discount_pct && b.programs.early_bird_deadline && todayIso <= b.programs.early_bird_deadline) {
      earlyPct = b.programs.early_pay_discount_pct
    } else if (b.programs?.early_pay_discount_pct_tier2 && b.programs.early_bird_deadline_tier2 && todayIso <= b.programs.early_bird_deadline_tier2) {
      earlyPct = b.programs.early_pay_discount_pct_tier2
    }
    const perSessionAfterEB = earlyPct > 0
      ? Math.round(basePrice * (100 - earlyPct) / 100)
      : basePrice

    // Build the new charges for missing sessions (one per session)
    const rows = missing.map(s => ({
      family_id: b.family_id,
      player_id: b.player_id,
      type: 'session',
      source_type: 'enrollment',
      source_id: b.id,
      session_id: s.id,
      program_id: b.program_id,
      booking_id: b.id,
      description: `${b.players?.first_name ?? 'Player'} - ${b.programs?.name ?? 'Program'} - ${termLabel(s.date)} - ${s.date}`,
      amount_cents: perSessionAfterEB,
      status: 'pending',
      created_by: b.booked_by,
      pricing_breakdown: buildBreakdown({
        basePriceCents: basePrice,
        perSessionPriceCents: basePrice,
        multiGroupApplied: false,
        earlyBirdPct: earlyPct,
        sessions: 1,
      }),
    }))

    console.log(`  ${b.players?.first_name ?? '?'} - ${b.programs?.name ?? '?'}: ${missing.length} new pending charges @ $${(perSessionAfterEB/100).toFixed(2)}`)
    chargesCreated += missing.length

    if (APPLY) {
      // Batch insert (REST chunks of 50)
      for (let i = 0; i < rows.length; i += 50) {
        await rest('POST', 'charges', rows.slice(i, i + 50))
      }
      await rpc('recalculate_family_balance', { target_family_id: b.family_id })
    }
  }
  console.log(`Pay-later pass: ${chargesCreated} charges ${APPLY ? 'created' : 'would be created'}`)
  return chargesCreated
}

// ── PAY-NOW split pass ────────────────────────────────────────────────────

async function payNowPass() {
  console.log('\n=== PAY-NOW split pass ===')
  let bookingFilter = `booking_type=in.(term,term_enrollment)&payment_option=eq.pay_now&status=eq.confirmed`
  if (FAMILY_FILTER) bookingFilter += `&family_id=eq.${FAMILY_FILTER}`
  if (BOOKING_FILTER) bookingFilter += `&id=eq.${BOOKING_FILTER}`

  const bookings = await rest('GET',
    `bookings?${bookingFilter}&select=id,family_id,player_id,program_id,booked_by,notes,programs:program_id(id,name,type),players:player_id(first_name)`,
  )
  console.log(`Pay-now term bookings to inspect: ${bookings.length}`)

  let bookingsSplit = 0
  for (const b of bookings) {
    if ((b.notes ?? '').includes('[backfill_split:done]')) continue

    // Find the legacy term_enrollment charge for this booking
    const termCharges = await rest('GET',
      `charges?booking_id=eq.${b.id}&type=eq.term_enrollment&status=in.(pending,confirmed)&select=id,amount_cents,description,pricing_breakdown,created_by`,
    )
    if (termCharges.length === 0) continue
    if (termCharges.length > 1) {
      console.warn(`  SKIP booking ${b.id} — found ${termCharges.length} term_enrollment charges (manual review)`)
      continue
    }
    const termCharge = termCharges[0]

    // The allocation(s) against this term charge
    const allocs = await rest('GET',
      `payment_allocations?charge_id=eq.${termCharge.id}&select=id,payment_id,amount_cents`,
    )

    // Future scheduled sessions for the program
    const today = new Date().toISOString().slice(0, 10)
    const sessions = await rest('GET',
      `sessions?program_id=eq.${b.program_id}&status=eq.scheduled&date=gte.${today}&order=date.asc&select=id,date`,
    )
    if (sessions.length === 0) {
      console.log(`  SKIP ${b.players?.first_name ?? '?'} - ${b.programs?.name ?? '?'} — no future sessions`)
      continue
    }

    const totalCents = termCharge.amount_cents
    const N = sessions.length
    const perSessionFloor = Math.floor(totalCents / N)
    const tail = totalCents - perSessionFloor * (N - 1)
    // Pull the original breakdown for per-session reconstruction
    const origBreakdown = termCharge.pricing_breakdown ?? null
    const subtotalCents = origBreakdown?.subtotal_cents ?? totalCents
    const multiOff = origBreakdown?.multi_group_cents_off ?? 0
    const earlyOff = origBreakdown?.early_bird_cents_off ?? 0
    const earlyPct = origBreakdown?.early_bird_pct ?? 0
    const multiApplied = (origBreakdown?.multi_group_cents_off ?? 0) > 0
    const perSessionBase = Math.round(subtotalCents / N)

    const newRows = sessions.map((s, i) => {
      const isLast = i === N - 1
      const amount = isLast ? tail : perSessionFloor
      const breakdown = buildBreakdown({
        basePriceCents: perSessionBase,
        perSessionPriceCents: perSessionBase - Math.round(multiOff / N),
        multiGroupApplied: multiApplied,
        earlyBirdPct: earlyPct,
        sessions: 1,
      })
      // Force per-row total to match the actual stored amount on the last row
      // so visual math matches.
      if (isLast && breakdown.total_cents !== amount) breakdown.total_cents = amount

      return {
        family_id: b.family_id,
        player_id: b.player_id,
        type: 'session',
        source_type: 'enrollment',
        source_id: b.id,
        session_id: s.id,
        program_id: b.program_id,
        booking_id: b.id,
        description: `${b.players?.first_name ?? 'Player'} - ${b.programs?.name ?? 'Program'} - ${termLabel(s.date)} - ${s.date}`,
        amount_cents: amount,
        status: 'confirmed',
        created_by: termCharge.created_by ?? b.booked_by,
        pricing_breakdown: breakdown,
      }
    })

    console.log(`  ${b.players?.first_name ?? '?'} - ${b.programs?.name ?? '?'}: split 1 charge ($${(totalCents/100).toFixed(2)}) → ${N} charges + ${allocs.length} alloc(s) → ${N} allocs`)
    bookingsSplit++

    if (APPLY) {
      // 1. Insert new per-session charges
      const created = await rest('POST', 'charges', newRows)
      // 2. Map new alloc rows by payment + new charge
      const allocRows = []
      // We assume a single allocation against the term charge (typical case).
      const pay = allocs[0]
      if (!pay) {
        console.warn(`  WARN booking ${b.id} — no allocation against term charge; skipping reallocation`)
      } else {
        for (const c of created) {
          allocRows.push({ payment_id: pay.payment_id, charge_id: c.id, amount_cents: c.amount_cents })
        }
      }
      // 3. Delete the old allocation, void the legacy term charge
      if (pay) {
        await rest('DELETE', `payment_allocations?id=eq.${pay.id}`)
      }
      await rest('PATCH', `charges?id=eq.${termCharge.id}`, { status: 'voided' })
      // 4. Insert the new allocations
      if (allocRows.length > 0) {
        await rest('POST', 'payment_allocations', allocRows)
      }
      // 5. Mark booking as split-done
      const newNotes = `${b.notes ?? ''}${b.notes ? ' ' : ''}[backfill_split:done]`
      await rest('PATCH', `bookings?id=eq.${b.id}`, { notes: newNotes })
      // 6. Recalculate balance (should net to the same value)
      await rpc('recalculate_family_balance', { target_family_id: b.family_id })
    }
  }
  console.log(`Pay-now split pass: ${bookingsSplit} bookings ${APPLY ? 'split' : 'would be split'}`)
  return bookingsSplit
}

// ── Run ───────────────────────────────────────────────────────────────────

;(async () => {
  try {
    const created = await payLaterPass()
    const split = await payNowPass()
    console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} totals: ${created} pay-later charges, ${split} pay-now bookings split`)
    if (DRY_RUN) console.log('Re-run with --apply to write changes.')
  } catch (e) {
    console.error('Backfill failed:', e?.message ?? e)
    process.exit(1)
  }
})()
