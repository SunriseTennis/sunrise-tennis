import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createCharge, formatChargeDescription, type CreateChargeParams } from './billing'
import { getPlayerSessionPriceBreakdown, formatDiscountSuffix, buildPricingBreakdown } from './player-pricing'
import { getTermLabel } from './school-terms'

type Supabase = SupabaseClient<Database>

export interface BuildTermChargesArgs {
  familyId: string
  playerId: string
  programId: string
  bookingId: string
  programType: string | null | undefined
  /** Active early-pay discount percent (0 when none). Applied per-session deterministically. */
  earlyBirdPct: number
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
