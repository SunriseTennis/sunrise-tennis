import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createCharge, recalculateBalance, type PricingBreakdown } from './billing'
import {
  getPlayerSessionPriceBreakdown,
  getPlayerEligibleEnrolmentsWithPrices,
  buildPricingBreakdown,
  type EarlyBirdMeta,
} from './player-pricing'
import { getActiveEarlyBird } from './eligibility'

type Supabase = SupabaseClient<Database>

// ──────────────────────────────────────────────────────────────────────────
// Phase D — Multi-group adjustment charges on anchor unenrol.
//
// When a parent unenrols a player from one program, any OTHER paid program
// of that player that previously qualified for the 25% multi-group discount
// because of the now-withdrawn anchor must claw back the discount as a new
// "adjustment" charge. The early-bird that was applied at the time of
// payment stays on the surviving charge — only the multi-group component is
// reversed (reduced by whatever percentage early-bird discounted the
// receipt).
//
// This overrides the pay-now-immutable clause in
// `Zanshin/Decisions/pricing/multi-group-discount.md` (revised 05-May-2026).
// ──────────────────────────────────────────────────────────────────────────

interface PaidChargeRow {
  id: string
  program_id: string | null
  amount_cents: number
  status: string
  description: string
  pricing_breakdown: PricingBreakdown | null
  programs: { name: string } | null
}

/**
 * Generate adjustment charges for a player's other paid term enrolments when
 * the multi-group anchor is being withdrawn. Inserts one `charges` row per
 * affected per-session charge.
 *
 * Caller is responsible for: (a) flipping `program_roster.status='withdrawn'`
 * BEFORE calling this so the multi-group recompute uses the post-unenrol
 * roster, and (b) calling `recalculateBalance` after (createCharge already
 * does this for each insert, but a final defensive call is cheap).
 */
export async function generateMultiGroupAdjustments(
  supabase: Supabase,
  familyId: string,
  playerId: string,
  withdrawnProgramId: string,
  withdrawnProgramName: string | null,
  createdBy: string,
): Promise<{ adjustmentsCreated: number }> {
  // 1. Pull every paid (or partially paid) per-session charge for this player
  //    on programs OTHER than the one being withdrawn, where multi-group was
  //    applied at the time of original billing.
  const { data: candidates } = await supabase
    .from('charges')
    .select('id, program_id, amount_cents, status, description, pricing_breakdown, programs:program_id(name)')
    .eq('family_id', familyId)
    .eq('player_id', playerId)
    .eq('type', 'session')
    .neq('program_id', withdrawnProgramId)
    .in('status', ['pending', 'confirmed'])

  if (!candidates || candidates.length === 0) return { adjustmentsCreated: 0 }

  // For each candidate, check (a) it had multi-group applied and (b) it's
  // actually paid (allocations cover the full charge). We do this in two
  // batched queries to avoid an N+1 fetch loop.
  const candidateIds = candidates.map(c => c.id)
  const { data: allocations } = await supabase
    .from('payment_allocations')
    .select('charge_id, amount_cents')
    .in('charge_id', candidateIds)

  const paidByCharge = new Map<string, number>()
  for (const a of allocations ?? []) {
    paidByCharge.set(
      a.charge_id,
      (paidByCharge.get(a.charge_id) ?? 0) + (a.amount_cents ?? 0),
    )
  }

  const affected: PaidChargeRow[] = []
  for (const c of candidates as unknown as PaidChargeRow[]) {
    const b = c.pricing_breakdown
    if (!b || !b.multi_group_pct || b.multi_group_pct <= 0) continue
    if (b.morning_squad_partner_applied) continue // separate rule path — not in v1
    const paid = paidByCharge.get(c.id) ?? 0
    if (paid < c.amount_cents) continue // unpaid → no adjustment, recompute on commit handles it
    affected.push(c)
  }

  if (affected.length === 0) return { adjustmentsCreated: 0 }

  // 2. Recompute the live multi-group state — without the withdrawn program.
  //    `getPlayerEligibleEnrolmentsWithPrices` already filters
  //    `program_roster.status='enrolled'`, so the withdrawn program (which the
  //    caller has already flipped) is naturally excluded.
  const enrolments = await getPlayerEligibleEnrolmentsWithPrices(supabase, familyId, playerId)
  const sorted = [...enrolments].sort((a, b) => {
    if (b.base_price_cents !== a.base_price_cents) return b.base_price_cents - a.base_price_cents
    return a.enrolled_at.localeCompare(b.enrolled_at)
  })
  const top = sorted[0]

  // 3. For each affected charge: decide whether multi-group still applies
  //    under the new roster state. If it does NOT, write an adjustment.
  let adjustmentsCreated = 0
  for (const c of affected) {
    if (!c.program_id) continue
    const stillEnrolled = enrolments.some(e => e.program_id === c.program_id)
    const stillMultiGroup =
      stillEnrolled && top != null && top.program_id !== c.program_id
    if (stillMultiGroup) continue

    const b = c.pricing_breakdown!
    const subtotal = b.subtotal_cents ?? 0
    const earlyBirdPct = b.early_bird_pct ?? 0
    const shouldHaveBeen = Math.round(subtotal * (100 - earlyBirdPct) / 100)
    const delta = shouldHaveBeen - c.amount_cents
    if (delta <= 0) continue // sanity check — should always be > 0 when multi-group applied

    const programName = c.programs?.name ?? 'a program'
    const adjustmentDescription =
      `Multi-group lost — ${programName} returns to full price` +
      (withdrawnProgramName ? ` (${withdrawnProgramName} withdrawn)` : '')

    const adjustmentBreakdown: PricingBreakdown = {
      total_cents: delta,
      adjustment_for_charge_id: c.id,
      adjustment_reason: 'multi_group_no_longer_eligible',
      original_charge_description: c.description,
      surrendered_multi_group_cents_off: b.multi_group_cents_off ?? 0,
      residual_early_bird_pct: earlyBirdPct,
    }

    await createCharge(supabase, {
      familyId,
      playerId,
      type: 'multi_group_adjustment',
      sourceType: 'adjustment',
      sourceId: c.id,
      programId: c.program_id,
      description: adjustmentDescription,
      amountCents: delta,
      status: 'confirmed', // immediately owed; not session-bound so confirmed_balance picks it up
      createdBy,
      pricingBreakdown: adjustmentBreakdown,
    })
    adjustmentsCreated++
  }

  return { adjustmentsCreated }
}

// ──────────────────────────────────────────────────────────────────────────
// Phase B — Live recompute for display.
//
// Returns a Map<chargeId, liveBreakdown> for every PENDING UNPAID per-session
// charge for this family. Use this to overlay today's pricing on /parent/payments
// without persisting until the parent commits (Phase C).
//
// Caching: groups charges by (player_id, program_id) and computes one
// breakdown per tuple — avoids N+1 RPC fan-out flagged in the plan-review.
// ──────────────────────────────────────────────────────────────────────────

export interface LiveBreakdownInfo {
  /** New per-session amount (cents) — what the charge would be if billed today. */
  amountCents: number
  /** New pricing_breakdown JSON — render this in PricingBreakdownPanel for
   *  pending unpaid rows, instead of the frozen `pricing_breakdown` from DB. */
  breakdown: ReturnType<typeof buildPricingBreakdown>
}

interface PendingChargeForRecompute {
  id: string
  player_id: string | null
  program_id: string | null
  amount_cents: number
  pricing_breakdown: PricingBreakdown | null
  programs: {
    type: string | null
    early_pay_discount_pct: number | null
    early_bird_deadline: string | null
    early_pay_discount_pct_tier2: number | null
    early_bird_deadline_tier2: string | null
  } | null
}

export async function recomputePendingChargesForFamily(
  supabase: Supabase,
  familyId: string,
): Promise<Map<string, LiveBreakdownInfo>> {
  const { data: pending } = await supabase
    .from('charges')
    .select('id, player_id, program_id, amount_cents, pricing_breakdown, programs:program_id(type, early_pay_discount_pct, early_bird_deadline, early_pay_discount_pct_tier2, early_bird_deadline_tier2)')
    .eq('family_id', familyId)
    .eq('type', 'session')
    .eq('status', 'pending')

  const result = new Map<string, LiveBreakdownInfo>()
  if (!pending || pending.length === 0) return result

  const today = new Date().toISOString().split('T')[0]

  // Cache by (playerId, programId) — every charge for the same tuple shares
  // the same per-session price + breakdown shape.
  const tupleCache = new Map<string, { breakdown: Awaited<ReturnType<typeof getPlayerSessionPriceBreakdown>>; ebPct: number; ebMeta: EarlyBirdMeta }>()

  for (const raw of pending) {
    const c = raw as unknown as PendingChargeForRecompute
    if (!c.player_id || !c.program_id) continue

    // Filter to charges with an outstanding balance — fully-allocated pending
    // charges (rare race window) don't need recompute.
    // We don't have allocations here; the caller (page.tsx) has already
    // computed outstanding_cents. For belt-and-braces, we still write the
    // breakdown — page filters which to render.

    const tupleKey = `${c.player_id}::${c.program_id}`
    let cached = tupleCache.get(tupleKey)
    if (!cached) {
      const program = c.programs
      const breakdown = await getPlayerSessionPriceBreakdown(
        supabase, familyId, c.program_id, program?.type ?? null, c.player_id,
      )
      const eb = getActiveEarlyBird({
        early_pay_discount_pct: program?.early_pay_discount_pct ?? null,
        early_bird_deadline: program?.early_bird_deadline ?? null,
        early_pay_discount_pct_tier2: program?.early_pay_discount_pct_tier2 ?? null,
        early_bird_deadline_tier2: program?.early_bird_deadline_tier2 ?? null,
      }, today)
      cached = {
        breakdown,
        ebPct: eb.pct,
        ebMeta: {
          tier: eb.tier,
          deadline: eb.deadline,
          tier2Pct: program?.early_pay_discount_pct_tier2 ?? null,
          tier2Deadline: program?.early_bird_deadline_tier2 ?? null,
        },
      }
      tupleCache.set(tupleKey, cached)
    }

    const liveBreakdown = buildPricingBreakdown({
      basePriceCents: cached.breakdown.basePriceCents,
      perSessionPriceCents: cached.breakdown.priceCents,
      morningSquadPartnerApplied: cached.breakdown.morningSquadPartnerApplied,
      multiGroupApplied: cached.breakdown.multiGroupApplied,
      sessions: 1,
      earlyBirdPct: cached.ebPct,
      earlyBirdMeta: cached.ebMeta,
    })
    const liveAmount = cached.ebPct > 0
      ? Math.round(cached.breakdown.priceCents * (100 - cached.ebPct) / 100)
      : cached.breakdown.priceCents
    // Force the displayed total to the live amount so the panel never disagrees
    // with the headline figure.
    liveBreakdown.total_cents = liveAmount

    result.set(c.id, { amountCents: liveAmount, breakdown: liveBreakdown })
  }

  return result
}

// ──────────────────────────────────────────────────────────────────────────
// Phase C — Persist recompute on payment commit.
//
// `persistChargeRecompute` updates the charges' amount_cents + pricing_breakdown
// to today's price, then returns the verified total. Used by the new
// "Pay this bundle" flow to ensure Stripe's intent.amount matches what the
// parent will be allocated against.
// ──────────────────────────────────────────────────────────────────────────

export async function persistChargeRecompute(
  supabase: Supabase,
  chargeIds: string[],
  familyId: string,
  /** Optional precomputed map (e.g. from a prior `recomputePendingChargesForFamily` call). */
  precomputed?: Map<string, LiveBreakdownInfo>,
): Promise<{ verifiedTotalCents: number; updatedChargeIds: string[] }> {
  if (chargeIds.length === 0) return { verifiedTotalCents: 0, updatedChargeIds: [] }

  const live = precomputed ?? await recomputePendingChargesForFamily(supabase, familyId)

  let verifiedTotalCents = 0
  const updatedChargeIds: string[] = []

  for (const chargeId of chargeIds) {
    const info = live.get(chargeId)
    if (!info) continue // not pending or no longer eligible — skip
    const { error } = await supabase
      .from('charges')
      .update({
        amount_cents: info.amountCents,
        pricing_breakdown: info.breakdown as never,
      })
      .eq('id', chargeId)
    if (error) {
      console.error('persistChargeRecompute update failed:', error.message, 'charge:', chargeId)
      continue
    }
    verifiedTotalCents += info.amountCents
    updatedChargeIds.push(chargeId)
  }

  // Recalculate family_balance once after the batch — Phase C must keep the
  // cached balance in sync since charges.amount_cents just changed.
  if (updatedChargeIds.length > 0) {
    try {
      await recalculateBalance(supabase, familyId)
    } catch (e) {
      console.error('recalculateBalance after persistChargeRecompute failed:', e instanceof Error ? e.message : e)
    }
  }

  return { verifiedTotalCents, updatedChargeIds }
}
