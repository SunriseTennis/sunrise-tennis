import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createCharge, getSessionPrice, recalculateBalance, voidCharge, type PricingBreakdown } from './billing'
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
  // actually paid (allocations cover the full charge). We do this in batched
  // queries to avoid an N+1 fetch loop. Idempotency: skip charges that
  // already have a matching adjustment (e.g. parent unenrol → re-enrol →
  // unenrol → don't double-charge).
  const candidateIds = candidates.map(c => c.id)
  const [{ data: allocations }, { data: existingAdjustments }] = await Promise.all([
    supabase
      .from('payment_allocations')
      .select('charge_id, amount_cents')
      .in('charge_id', candidateIds),
    supabase
      .from('charges')
      .select('source_id')
      .eq('family_id', familyId)
      .eq('type', 'multi_group_adjustment')
      .neq('status', 'voided')
      .in('source_id', candidateIds),
  ])

  const paidByCharge = new Map<string, number>()
  for (const a of allocations ?? []) {
    paidByCharge.set(
      a.charge_id,
      (paidByCharge.get(a.charge_id) ?? 0) + (a.amount_cents ?? 0),
    )
  }
  const alreadyAdjusted = new Set(
    (existingAdjustments ?? []).map(a => a.source_id as string),
  )

  const affected: PaidChargeRow[] = []
  for (const c of candidates as unknown as PaidChargeRow[]) {
    const b = c.pricing_breakdown
    if (!b || !b.multi_group_pct || b.multi_group_pct <= 0) continue
    if (b.morning_squad_partner_applied) continue // handled by `generateMorningSquadPartnerAdjustments`
    if (alreadyAdjusted.has(c.id)) continue // idempotent — already clawed back
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
// Morning-squad-partner-lost adjustment (Plan "Atomic Gathering Octopus" v2).
//
// When a parent unenrols a player from one of the morning squads (Tue/Wed),
// the partner squad's paid per-session charges that priced at the $15 cross-
// day partner rate must claw back to the regular base price (still net of
// any early-bird percent that was earned at the original payment).
//
// Math: shouldHaveBeen = currentBase × (100 − frozen_early_bird_pct)/100;
// adjustment = shouldHaveBeen − total_cents.
// ──────────────────────────────────────────────────────────────────────────

const MORNING_SQUAD_SLUGS = ['tue-morning-squad', 'wed-morning-squad'] as const

export async function generateMorningSquadPartnerAdjustments(
  supabase: Supabase,
  familyId: string,
  playerId: string,
  withdrawnProgramId: string,
  withdrawnProgramName: string | null,
  createdBy: string,
): Promise<{ adjustmentsCreated: number }> {
  // Only fires when the withdrawn program is one of the morning squads.
  const { data: withdrawn } = await supabase
    .from('programs')
    .select('slug')
    .eq('id', withdrawnProgramId)
    .maybeSingle()

  const wSlug = (withdrawn?.slug as string | null) ?? null
  if (!wSlug || !(MORNING_SQUAD_SLUGS as readonly string[]).includes(wSlug)) {
    return { adjustmentsCreated: 0 }
  }

  const partnerSlug = wSlug === 'tue-morning-squad' ? 'wed-morning-squad' : 'tue-morning-squad'

  const { data: partner } = await supabase
    .from('programs')
    .select('id, name, type')
    .eq('slug', partnerSlug)
    .maybeSingle()
  if (!partner) return { adjustmentsCreated: 0 }

  // Find paid (or partially paid) charges on the partner program that priced
  // at the $15 partner rate. Pay-later charges with status='pending' that
  // happen to be allocated count too — we only adjust if fully paid.
  const { data: candidates } = await supabase
    .from('charges')
    .select('id, program_id, amount_cents, status, description, pricing_breakdown')
    .eq('family_id', familyId)
    .eq('player_id', playerId)
    .eq('program_id', partner.id)
    .eq('type', 'session')
    .in('status', ['pending', 'confirmed'])

  if (!candidates || candidates.length === 0) return { adjustmentsCreated: 0 }

  const candidateIds = candidates.map(c => c.id)
  const [{ data: allocations }, { data: existingAdjustments }] = await Promise.all([
    supabase
      .from('payment_allocations')
      .select('charge_id, amount_cents')
      .in('charge_id', candidateIds),
    supabase
      .from('charges')
      .select('source_id')
      .eq('family_id', familyId)
      .eq('type', 'morning_squad_partner_adjustment')
      .neq('status', 'voided')
      .in('source_id', candidateIds),
  ])

  const paidByCharge = new Map<string, number>()
  for (const a of allocations ?? []) {
    paidByCharge.set(
      a.charge_id,
      (paidByCharge.get(a.charge_id) ?? 0) + (a.amount_cents ?? 0),
    )
  }
  const alreadyAdjusted = new Set(
    (existingAdjustments ?? []).map(a => a.source_id as string),
  )

  interface PartnerCandidate {
    id: string
    program_id: string | null
    amount_cents: number
    status: string
    description: string
    pricing_breakdown: PricingBreakdown | null
  }

  const affected: PartnerCandidate[] = []
  for (const c of candidates as unknown as PartnerCandidate[]) {
    const b = c.pricing_breakdown
    if (!b || !b.morning_squad_partner_applied) continue
    if (alreadyAdjusted.has(c.id)) continue
    const paid = paidByCharge.get(c.id) ?? 0
    if (paid < c.amount_cents) continue
    affected.push(c)
  }

  if (affected.length === 0) return { adjustmentsCreated: 0 }

  // Resolve the partner program's CURRENT base price (post-family-override).
  // This is the per-session amount the partner squad would cost without the
  // $15 partner discount. If it's unchanged from the program default since
  // the original charge, the math is exact; if admin changed the price in
  // between, the adjustment uses today's value (acceptable edge).
  const baseCents = await getSessionPrice(supabase, familyId, partner.id, partner.type ?? null)
  if (!baseCents || baseCents <= 0) return { adjustmentsCreated: 0 }

  let adjustmentsCreated = 0
  for (const c of affected) {
    if (!c.program_id) continue
    const b = c.pricing_breakdown!
    const earlyBirdPct = b.early_bird_pct ?? 0
    const sessions = b.sessions ?? 1
    const shouldHaveBeen = Math.round(baseCents * sessions * (100 - earlyBirdPct) / 100)
    const delta = shouldHaveBeen - c.amount_cents
    if (delta <= 0) continue

    const adjustmentDescription =
      `Morning-squad partner rate lost — ${partner.name} returns to full price` +
      (withdrawnProgramName ? ` (${withdrawnProgramName} withdrawn)` : '')

    const adjustmentBreakdown: PricingBreakdown = {
      total_cents: delta,
      adjustment_for_charge_id: c.id,
      adjustment_reason: 'morning_squad_partner_lost',
      original_charge_description: c.description,
      residual_early_bird_pct: earlyBirdPct,
    }

    await createCharge(supabase, {
      familyId,
      playerId,
      type: 'morning_squad_partner_adjustment',
      sourceType: 'adjustment',
      sourceId: c.id,
      programId: c.program_id,
      description: adjustmentDescription,
      amountCents: delta,
      status: 'confirmed',
      createdBy,
      pricingBreakdown: adjustmentBreakdown,
    })
    adjustmentsCreated++
  }

  return { adjustmentsCreated }
}

// ──────────────────────────────────────────────────────────────────────────
// Reverse claw-back adjustments after enrol (Plan "re-enrol fix", 05-May-2026).
//
// `generateMultiGroupAdjustments` and `generateMorningSquadPartnerAdjustments`
// fire on unenrol and create `multi_group_adjustment` / `morning_squad_partner_adjustment`
// charges that claw back a discount on OTHER paid programs because the anchor
// (or partner) was withdrawn.
//
// When the player is enrolled (or re-enrolled) into a program, the trigger
// condition for some of those past adjustments may no longer hold — the source
// charge's program could once again qualify for the discount that was clawed
// back. In that case, void the adjustment so the family isn't penalised for a
// state they're no longer in.
//
// Idempotent + safe to run on every enrol path:
//   - For a fresh family with no adjustments, this is a one-query no-op.
//   - For a re-enrol that re-establishes the anchor / partner, only the
//     adjustments that the *current* roster contradicts are voided.
//
// Caller is responsible for: (a) flipping `program_roster.status='enrolled'`
// BEFORE calling this so the multi-group + partner-rate recompute uses the
// post-enrol roster, and (b) passing a Supabase client with UPDATE access
// on `charges` (service-role for the parent-facing path; admin JWT-scoped
// works elsewhere).
// ──────────────────────────────────────────────────────────────────────────

const MORNING_SQUAD_PARTNERS: Record<string, string> = {
  'tue-morning-squad': 'wed-morning-squad',
  'wed-morning-squad': 'tue-morning-squad',
}

interface AdjustmentRow {
  id: string
  type: string
  source_id: string | null
}

interface SourceChargeRow {
  id: string
  program_id: string | null
  programs: { slug: string | null } | null
}

export async function reverseAdjustmentsAfterEnrol(
  supabase: Supabase,
  familyId: string,
  playerId: string,
): Promise<{ adjustmentsReversed: number }> {
  // 1. Find non-voided claw-back adjustments for this player.
  const { data: adjustmentsRaw } = await supabase
    .from('charges')
    .select('id, type, source_id')
    .eq('family_id', familyId)
    .eq('player_id', playerId)
    .in('type', ['multi_group_adjustment', 'morning_squad_partner_adjustment'])
    .neq('status', 'voided')

  const adjustments = (adjustmentsRaw ?? []) as AdjustmentRow[]
  if (adjustments.length === 0) return { adjustmentsReversed: 0 }

  const sourceIds = adjustments
    .map(a => a.source_id)
    .filter((id): id is string => !!id)
  if (sourceIds.length === 0) return { adjustmentsReversed: 0 }

  // 2. Resolve source charges + their program slugs (slugs needed for the
  //    morning-squad-partner check; program_id alone is enough for multi-group).
  const { data: sourceChargesRaw } = await supabase
    .from('charges')
    .select('id, program_id, programs:program_id(slug)')
    .in('id', sourceIds)
  const sourceById = new Map<string, SourceChargeRow>(
    ((sourceChargesRaw ?? []) as unknown as SourceChargeRow[]).map(s => [s.id, s]),
  )

  // 3. Compute the post-enrol enrolment set + slug membership in one shot.
  const enrolments = await getPlayerEligibleEnrolmentsWithPrices(supabase, familyId, playerId)
  const sorted = [...enrolments].sort((a, b) => {
    if (b.base_price_cents !== a.base_price_cents) return b.base_price_cents - a.base_price_cents
    return a.enrolled_at.localeCompare(b.enrolled_at)
  })
  const top = sorted[0] ?? null

  // For partner check we need slugs of currently-enrolled programs.
  const { data: enrolledSlugRows } = await supabase
    .from('program_roster')
    .select('programs:program_id(slug)')
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
  const enrolledSlugs = new Set(
    ((enrolledSlugRows ?? []) as unknown as { programs: { slug: string | null } | null }[])
      .map(r => r.programs?.slug)
      .filter((s): s is string => !!s),
  )

  // 4. For each adjustment, decide whether the trigger condition still holds.
  //    Void it if the source program would now qualify for the discount that
  //    was clawed back.
  let adjustmentsReversed = 0
  for (const adj of adjustments) {
    if (!adj.source_id) continue
    const source = sourceById.get(adj.source_id)
    if (!source || !source.program_id) continue

    let shouldReverse = false

    if (adj.type === 'multi_group_adjustment') {
      // Adjustment was created because source.program_id lost multi-group.
      // Reverse if the player's current roster makes it eligible again:
      //   (a) the source program is currently enrolled, AND
      //   (b) there is a top-priced anchor that is NOT this same program.
      const stillEnrolled = enrolments.some(e => e.program_id === source.program_id)
      const stillMultiGroup = stillEnrolled && top != null && top.program_id !== source.program_id
      if (stillMultiGroup) shouldReverse = true
    } else if (adj.type === 'morning_squad_partner_adjustment') {
      // Adjustment was created because source's morning-squad partner was
      // withdrawn. Reverse if the partner is currently enrolled again.
      const sourceSlug = source.programs?.slug ?? null
      const partnerSlug = sourceSlug ? MORNING_SQUAD_PARTNERS[sourceSlug] : null
      if (partnerSlug && enrolledSlugs.has(partnerSlug)) shouldReverse = true
    }

    if (shouldReverse) {
      await voidCharge(supabase, adj.id, familyId)
      adjustmentsReversed++
    }
  }

  return { adjustmentsReversed }
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

  // Step 1 — collect unique (player, program) tuples. Every pending charge
  // for the same tuple shares the same per-session price + breakdown shape,
  // so we only need to fetch one breakdown per tuple.
  type TupleSeed = {
    playerId: string
    programId: string
    program: PendingChargeForRecompute['programs']
  }
  const uniqueTuples = new Map<string, TupleSeed>()
  for (const raw of pending) {
    const c = raw as unknown as PendingChargeForRecompute
    if (!c.player_id || !c.program_id) continue
    const tupleKey = `${c.player_id}::${c.program_id}`
    if (!uniqueTuples.has(tupleKey)) {
      uniqueTuples.set(tupleKey, { playerId: c.player_id, programId: c.program_id, program: c.programs })
    }
  }

  // Step 2 — fetch breakdowns for every tuple in PARALLEL. Each
  // `getPlayerSessionPriceBreakdown` fires ~5 internal DB calls; awaiting
  // them sequentially in the previous loop dominated render latency for
  // multi-program families.
  type TupleResult = { breakdown: Awaited<ReturnType<typeof getPlayerSessionPriceBreakdown>>; ebPct: number; ebMeta: EarlyBirdMeta }
  const tupleEntries = await Promise.all(
    Array.from(uniqueTuples.entries()).map(async ([key, { playerId, programId, program }]): Promise<readonly [string, TupleResult]> => {
      const breakdown = await getPlayerSessionPriceBreakdown(
        supabase, familyId, programId, program?.type ?? null, playerId,
      )
      const eb = getActiveEarlyBird({
        early_pay_discount_pct: program?.early_pay_discount_pct ?? null,
        early_bird_deadline: program?.early_bird_deadline ?? null,
        early_pay_discount_pct_tier2: program?.early_pay_discount_pct_tier2 ?? null,
        early_bird_deadline_tier2: program?.early_bird_deadline_tier2 ?? null,
      }, today)
      return [key, {
        breakdown,
        ebPct: eb.pct,
        ebMeta: {
          tier: eb.tier,
          deadline: eb.deadline,
          tier2Pct: program?.early_pay_discount_pct_tier2 ?? null,
          tier2Deadline: program?.early_bird_deadline_tier2 ?? null,
        },
      }] as const
    }),
  )
  const tupleCache = new Map<string, TupleResult>(tupleEntries)

  // Step 3 — synchronously assign each pending charge its live breakdown.
  for (const raw of pending) {
    const c = raw as unknown as PendingChargeForRecompute
    if (!c.player_id || !c.program_id) continue

    const tupleKey = `${c.player_id}::${c.program_id}`
    const cached = tupleCache.get(tupleKey)
    if (!cached) continue

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

  // Build the (chargeId, info) work list, then fan out the UPDATEs in parallel
  // — was sequential awaits in a tight loop, which dominated runtime when
  // called from page render (N round trips per visit).
  const work = chargeIds
    .map(id => [id, live.get(id)] as const)
    .filter((x): x is readonly [string, LiveBreakdownInfo] => x[1] != null)

  const results = await Promise.all(
    work.map(async ([chargeId, info]) => {
      const { error } = await supabase
        .from('charges')
        .update({
          amount_cents: info.amountCents,
          pricing_breakdown: info.breakdown as never,
        })
        .eq('id', chargeId)
      if (error) {
        console.error('persistChargeRecompute update failed:', error.message, 'charge:', chargeId)
        return null
      }
      return { chargeId, amountCents: info.amountCents }
    }),
  )

  let verifiedTotalCents = 0
  const updatedChargeIds: string[] = []
  for (const r of results) {
    if (!r) continue
    verifiedTotalCents += r.amountCents
    updatedChargeIds.push(r.chargeId)
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
