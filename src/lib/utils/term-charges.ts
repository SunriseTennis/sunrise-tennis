import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createCharge, formatChargeDescription, voidCharge, type CreateChargeParams } from './billing'
import { getPlayerSessionPriceBreakdown, formatDiscountSuffix, buildPricingBreakdown, type EarlyBirdMeta } from './player-pricing'
import { getTermLabel } from './school-terms'
import { adelaideTodayString, isSessionFuture, filterFutureSessions } from './sessions-filter'

type Supabase = SupabaseClient<Database>

export interface BuildTermChargesArgs {
  familyId: string
  playerId: string
  programId: string
  bookingId: string
  programType: string | null | undefined
  /** Active early-pay discount percent (0 when none). Applied per-session deterministically. */
  earlyBirdPct: number
  /** Optional metadata for the early-bird tier (deadline + tier-2 footnote in pricing_breakdown). */
  earlyBirdMeta?: EarlyBirdMeta | null
  chargeStatus: 'pending' | 'confirmed'
  createdBy: string
  /** Sessions to bill — must be already filtered to scheduled+future. */
  sessions: { id: string; date: string }[]
  playerName: string | null | undefined
  programName: string | null | undefined
  /** When set, forces Σ charge amounts to this value (last row absorbs rounding).
   *  Use for pay-now finalize where Σ must equal the Stripe intent.amount exactly. */
  forceTotalCents?: number | null
}

export interface TermChargeSpec {
  /** Per-session amount in cents (after multi-group + early-bird). */
  amountCents: number
  /** Pricing breakdown JSON for THIS session row. */
  pricingBreakdown: Record<string, unknown>
  /** Charge description (player + label + date). */
  description: string
  /** Session id this charge is bound to. */
  sessionId: string
}

/**
 * Compute N per-session charge specs for a term enrolment. Pricing is resolved
 * once via `getPlayerSessionPriceBreakdown` (multi-group state is term-stable
 * for the calculation moment), then mapped to N rows. Early-bird is applied
 * per-session deterministically; rounding remainder lands on the last row so
 * Σ amounts equals the intended bundled total exactly.
 */
export async function buildTermSessionCharges(
  supabase: Supabase,
  args: BuildTermChargesArgs,
): Promise<TermChargeSpec[]> {
  if (args.sessions.length === 0) return []

  const breakdown = await getPlayerSessionPriceBreakdown(
    supabase, args.familyId, args.programId, args.programType, args.playerId,
  )

  const N = args.sessions.length
  const ebPct = Math.max(0, args.earlyBirdPct ?? 0)
  // Per-session price after multi-group, after early-bird (rounded).
  const perSessionAfterEB = ebPct > 0
    ? Math.round(breakdown.priceCents * (100 - ebPct) / 100)
    : breakdown.priceCents

  // Σ check: with forceTotal, last row absorbs rounding so Σ == forceTotal.
  // Without forceTotal, all rows are equal at perSessionAfterEB.
  const target = args.forceTotalCents ?? perSessionAfterEB * N
  const tail = target - perSessionAfterEB * (N - 1)

  const term = getTermLabel(new Date())
  const suffix = formatDiscountSuffix({
    multiGroupApplied: breakdown.multiGroupApplied,
    earlyPayPct: ebPct,
  })

  return args.sessions.map((session, i) => {
    const isLast = i === N - 1
    const amount = isLast ? tail : perSessionAfterEB
    // Per-row breakdown (sessions=1) so the row's PricingBreakdownPanel
    // renders the strikethrough math cleanly.
    const pricingBreakdown = buildPricingBreakdown({
      basePriceCents: breakdown.basePriceCents,
      perSessionPriceCents: breakdown.priceCents,
      morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
      multiGroupApplied: breakdown.multiGroupApplied,
      sessions: 1,
      earlyBirdPct: ebPct,
      earlyBirdMeta: args.earlyBirdMeta ?? null,
    })
    // Override total_cents on the last row so the displayed math matches
    // the actual stored amount (off by ≤ N cents in edge cases).
    if (isLast && pricingBreakdown.total_cents !== amount) {
      pricingBreakdown.total_cents = amount
    }

    return {
      amountCents: amount,
      pricingBreakdown,
      description: formatChargeDescription({
        playerName: args.playerName,
        label: args.programName ?? 'Session',
        suffix,
        term,
        date: session.date,
      }),
      sessionId: session.id,
    }
  })
}

// ── Mid-term enrol absorption (06-May-2026) ─────────────────────────────
//
// When a player is enrolled into a term program mid-term, their term
// enrolment should fold in any sessions they've already attended (status =
// 'present') AND any future-scheduled sessions, charging them at the term
// rate (with multi-group + early-bird applied) for the entire combined set.
// Pre-existing per-session charges (walk-in charges, partial-enrol
// leftovers) get voided and replaced by term-shaped charges; if any of
// them were paid, the surplus auto-applies via Plan-22 credit-allocation.
//
// Past sessions where the attendance was 'absent' or 'noshow' are NOT
// folded in — those follow the existing absence-credit / no-show policy
// (see `Apps/Features/payments.md`).

export interface TermEnrolSessions {
  /** Past-attended-present + future-scheduled sessions for this program,
   *  sorted by date ascending, deduped by session id. This is the list
   *  every term-enrol path should fan per-session charges over. */
  combinedSessions: { id: string; date: string; start_time: string | null }[]
  /** Existing non-voided per-session `charges.id` rows for THIS player+program
   *  scoped to sessions in `combinedSessions`. The caller voids these before
   *  creating fresh term-shaped charges. */
  absorbableChargeIds: string[]
  /** Sum of `payment_allocations.amount_cents` against absorbable charges
   *  whose status is 'pending' or 'confirmed'. This is "credit pending from
   *  voids" — feeds `prepareEnrolPayment`'s Stripe-amount calculation so a
   *  paid walk-in reduces the Stripe charge by exactly the prior payment. */
  pendingVoidCreditCents: number
}

/**
 * Gather everything a term-enrol path needs to produce a clean per-session
 * charge fan-out, even mid-term where the player has already attended some
 * sessions or has stranded walk-in charges.
 *
 * Two queries: future-scheduled sessions for the program, and the player's
 * past 'present' attendances joined back to their session rows. Combined and
 * deduped on session id. Then one query for absorbable charges and one for
 * their allocations.
 *
 * Adelaide-aware: uses `isSessionFuture` to split past vs future. A session
 * dated today whose `start_time` has already passed counts as past.
 */
export async function gatherTermEnrolSessions(
  supabase: Supabase,
  programId: string,
  playerId: string,
): Promise<TermEnrolSessions> {
  // 1) Future-scheduled sessions for this program (Adelaide-aware).
  const { data: futureRows } = await supabase
    .from('sessions')
    .select('id, date, start_time')
    .eq('program_id', programId)
    .eq('status', 'scheduled')
    .gte('date', adelaideTodayString())
    .order('date', { ascending: true })

  const futureSessions = filterFutureSessions(
    (futureRows ?? []) as { id: string; date: string; start_time: string | null }[],
  )

  // 2) Past-attended sessions: this player's 'present' attendances joined
  //    to their sessions, filtered to this program AND past-or-already-started.
  const { data: attendedRows } = await supabase
    .from('attendances')
    .select('session_id, sessions:session_id(id, date, start_time, program_id, status)')
    .eq('player_id', playerId)
    .eq('status', 'present')

  type AttendedSession = {
    id: string
    date: string
    start_time: string | null
    program_id: string | null
    status: string | null
  }

  const pastAttended = (attendedRows ?? [])
    .map(r => r.sessions as unknown as AttendedSession | null)
    .filter((s): s is AttendedSession =>
      !!s && s.program_id === programId && s.status !== 'cancelled' && !isSessionFuture(s),
    )
    .map(s => ({ id: s.id, date: s.date, start_time: s.start_time }))

  // 3) Combine + dedupe by session id (a session is normally either past
  //    or future, but a 'present' marked on a not-yet-started session would
  //    appear in both — keep the future-list version which is canonical).
  const seen = new Set<string>()
  const combinedSessions: { id: string; date: string; start_time: string | null }[] = []
  for (const s of [...pastAttended, ...futureSessions]) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      combinedSessions.push(s)
    }
  }
  combinedSessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  if (combinedSessions.length === 0) {
    return { combinedSessions, absorbableChargeIds: [], pendingVoidCreditCents: 0 }
  }

  // 4) Absorbable charges: non-voided per-session rows for this player+program
  //    bound to a session in the combined list.
  const sessionIds = combinedSessions.map(s => s.id)
  const { data: chargeRows } = await supabase
    .from('charges')
    .select('id')
    .eq('player_id', playerId)
    .eq('program_id', programId)
    .in('session_id', sessionIds)
    .in('status', ['pending', 'confirmed'])

  const absorbableChargeIds = (chargeRows ?? []).map(r => r.id)

  if (absorbableChargeIds.length === 0) {
    return { combinedSessions, absorbableChargeIds: [], pendingVoidCreditCents: 0 }
  }

  // 5) Allocations against absorbable charges → "credit pending from voids".
  //    Only count allocations from received payments; pending/voided payments
  //    don't represent real money on the family's balance.
  const { data: allocRows } = await supabase
    .from('payment_allocations')
    .select('amount_cents, payments:payment_id(status)')
    .in('charge_id', absorbableChargeIds)

  type AllocRow = { amount_cents: number; payments: { status: string } | null }
  const pendingVoidCreditCents = (allocRows ?? [])
    .map(r => r as unknown as AllocRow)
    .filter(r => r.payments?.status === 'received')
    .reduce((sum, r) => sum + (r.amount_cents ?? 0), 0)

  return { combinedSessions, absorbableChargeIds, pendingVoidCreditCents }
}

/**
 * Void each absorbable charge in turn. Idempotent on re-fire (voiding an
 * already-voided charge is a no-op via the status check inside `voidCharge`).
 * Caller is responsible for using a service-role client when the JWT-scoped
 * client has no UPDATE policy on `charges` (parents) — admin paths can pass
 * the JWT-scoped client.
 */
export async function voidAbsorbableCharges(
  supabase: Supabase,
  chargeIds: string[],
  familyId: string,
): Promise<void> {
  for (const id of chargeIds) {
    try {
      await voidCharge(supabase, id, familyId)
    } catch (e) {
      console.error('Failed to void absorbable charge', id, e instanceof Error ? e.message : e)
      // Non-fatal — we'll still create the new term charges; admin can
      // sweep any orphan walk-in charges manually if this ever surfaces.
    }
  }
}

/**
 * Convenience: build the specs and insert all the charges. Returns the new
 * charge ids in the same order as `args.sessions` so callers can wire
 * payment_allocations. Skips sessions where price is zero.
 */
export async function createTermSessionCharges(
  supabase: Supabase,
  args: BuildTermChargesArgs,
): Promise<{ chargeId: string; sessionId: string; amountCents: number }[]> {
  const specs = await buildTermSessionCharges(supabase, args)
  const out: { chargeId: string; sessionId: string; amountCents: number }[] = []
  for (const spec of specs) {
    if (spec.amountCents <= 0) continue
    const params: CreateChargeParams = {
      familyId: args.familyId,
      playerId: args.playerId,
      type: 'session',
      sourceType: 'enrollment',
      sourceId: args.bookingId,
      sessionId: spec.sessionId,
      programId: args.programId,
      bookingId: args.bookingId,
      description: spec.description,
      amountCents: spec.amountCents,
      status: args.chargeStatus,
      createdBy: args.createdBy,
      pricingBreakdown: spec.pricingBreakdown as never,
    }
    const { chargeId } = await createCharge(supabase, params)
    out.push({ chargeId, sessionId: spec.sessionId, amountCents: spec.amountCents })
  }
  return out
}
