import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getSessionPrice } from './billing'
import { getActiveEarlyBird } from './eligibility'

type Supabase = SupabaseClient<Database>

const MORNING_SQUAD_SLUGS = ['tue-morning-squad', 'wed-morning-squad'] as const
type MorningSquadSlug = (typeof MORNING_SQUAD_SLUGS)[number]

/** Program types that count toward (and receive) the 25% multi-group discount. */
const MULTI_GROUP_TYPES = ['group', 'squad'] as const

export const MULTI_GROUP_DISCOUNT_PCT = 25

type PlayerSessionPriceBreakdown = {
  /** Final per-session price in cents (after all discounts). */
  priceCents: number
  /** Price before any multi-group discount (program default or family override; or morning-squad partner rate if it fired). */
  basePriceCents: number
  /** True if the morning-squad cross-day partner rate replaced the base price. */
  morningSquadPartnerApplied: boolean
  /** True if the 25% multi-group discount was applied on top of basePrice. */
  multiGroupApplied: boolean
}

/**
 * Resolve the per-session price for a (family, program, player) tuple, applying
 * every discount that should compose at billing time:
 *
 *   1. Morning-squad cross-day partner rate ($15 flat, replaces base price).
 *      Fires when the player is already enrolled in the partner morning squad
 *      (Tue ↔ Wed). If this fires, no further multi-group discount stacks —
 *      $15 is already the deeper discount.
 *
 *   2. Base price = family override (family_pricing) or program default.
 *
 *   3. 25% multi-group discount per player. Applies when this program is NOT
 *      the player's *highest-base-price* eligible enrolment ('group','squad').
 *      Tie-break: when two enrolments share the highest base price, the older
 *      one (lower `enrolled_at`) keeps full price; the newer one is demoted.
 *      Recalculated on every billing event so dropping a higher-priced program
 *      promotes the next-most-expensive to full price going forward. For a
 *      casual booking on a program the player isn't on the roster of, the rule
 *      treats the casual as "additional" unless its base price strictly exceeds
 *      every roster enrolment.
 *
 *   The 25% is multiplicative with early-bird (early-bird is applied by the
 *   caller on top of this per-session price for pay-now term enrolments).
 */
export async function getPlayerSessionPriceBreakdown(
  supabase: Supabase,
  familyId: string,
  programId: string,
  programType: string | null | undefined,
  playerId: string,
): Promise<PlayerSessionPriceBreakdown> {
  // ── 1. Morning-squad partner rule ──────────────────────────────────────
  const partnerPrice = await getMorningSquadPartnerPrice(supabase, programId, playerId)
  if (partnerPrice !== null) {
    return {
      priceCents: partnerPrice,
      basePriceCents: partnerPrice,
      morningSquadPartnerApplied: true,
      multiGroupApplied: false,
    }
  }

  // ── 2. Base price (family override → program default) ──────────────────
  const basePrice = await getSessionPrice(supabase, familyId, programId, programType ?? null)

  // ── 3. Multi-group eligibility ─────────────────────────────────────────
  if (!isMultiGroupEligibleType(programType)) {
    return { priceCents: basePrice, basePriceCents: basePrice, morningSquadPartnerApplied: false, multiGroupApplied: false }
  }

  const enrolments = await getPlayerEligibleEnrolmentsWithPrices(supabase, familyId, playerId)
  if (enrolments.length === 0) {
    return { priceCents: basePrice, basePriceCents: basePrice, morningSquadPartnerApplied: false, multiGroupApplied: false }
  }

  // Sort: highest base price DESC, then enrolled_at ASC (older wins on ties).
  const sorted = [...enrolments].sort((a, b) => {
    if (b.base_price_cents !== a.base_price_cents) return b.base_price_cents - a.base_price_cents
    return a.enrolled_at.localeCompare(b.enrolled_at)
  })
  const top = sorted[0]

  // Is THIS program in the enrolment set?
  const thisInSet = enrolments.find(e => e.program_id === programId)

  let multiGroupApplied: boolean
  if (thisInSet) {
    // Roster billing: discount unless THIS is the top of the sort.
    multiGroupApplied = top.program_id !== programId
  } else {
    // Casual on non-roster program: discount unless its base strictly exceeds the top.
    multiGroupApplied = basePrice <= top.base_price_cents
  }

  if (multiGroupApplied) {
    return {
      priceCents: Math.round(basePrice * (1 - MULTI_GROUP_DISCOUNT_PCT / 100)),
      basePriceCents: basePrice,
      morningSquadPartnerApplied: false,
      multiGroupApplied: true,
    }
  }

  return { priceCents: basePrice, basePriceCents: basePrice, morningSquadPartnerApplied: false, multiGroupApplied: false }
}

/** Convenience wrapper when callers only need the final price. */
export async function getPlayerSessionPrice(
  supabase: Supabase,
  familyId: string,
  programId: string,
  programType: string | null | undefined,
  playerId: string,
): Promise<number> {
  const { priceCents } = await getPlayerSessionPriceBreakdown(supabase, familyId, programId, programType, playerId)
  return priceCents
}

export type PlayerEffectiveSessionPriceBreakdown = PlayerSessionPriceBreakdown & {
  /** Active early-bird percent embedded in the returned price (0 when none). */
  earlyBirdPct: number
  /** True when the price was inherited from the player's term per-session rate (or fresh-computed for an enrolled-roster-no-sibling-charge edge case). */
  inheritedFromTerm: boolean
}

/**
 * Effective per-session price for a casual / walk-in attendance.
 *
 * When the player is on the term roster for this program
 * (`program_roster.status='enrolled'`), the casual inherits the same
 * per-session rate the family agreed to at enrol time — including any
 * early-bird discount baked into the term charges. This keeps a casual
 * billed at $22.50 for a player whose term charges are $22.50, instead
 * of bouncing them to the $25 program default that
 * `getPlayerSessionPriceBreakdown` would return on its own.
 *
 * Order of resolution:
 *   1. Not on roster → standard walk-in price (matches today's behaviour).
 *   2. On roster + a non-voided enrolment-source charge exists for
 *      (player, program) → inherit `pricing_breakdown.total_cents` from
 *      the most recent such charge. This preserves the exact discount
 *      stack (multi-group, early-bird tier, family override) that was
 *      applied at enrol time, even if the program's discount config has
 *      changed since.
 *   3. On roster but no sibling charge yet (e.g. enrolment just landed
 *      and fan-out hasn't fired, or pre-Plan-Atomic-Gathering-Octopus
 *      data) → recompute fresh via `getPlayerSessionPriceBreakdown` and
 *      apply today's active early-bird tier.
 */
export async function getPlayerEffectiveSessionPriceBreakdown(
  supabase: Supabase,
  familyId: string,
  programId: string,
  programType: string | null | undefined,
  playerId: string,
): Promise<PlayerEffectiveSessionPriceBreakdown> {
  // 1. Roster check
  const { data: roster } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', programId)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .maybeSingle()

  if (!roster) {
    const std = await getPlayerSessionPriceBreakdown(supabase, familyId, programId, programType, playerId)
    return { ...std, earlyBirdPct: 0, inheritedFromTerm: false }
  }

  // 2. Inherit from most-recent non-voided enrolment charge
  const { data: siblingCharge } = await supabase
    .from('charges')
    .select('amount_cents, pricing_breakdown')
    .eq('player_id', playerId)
    .eq('program_id', programId)
    .eq('source_type', 'enrollment')
    .neq('status', 'voided')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (siblingCharge?.pricing_breakdown) {
    const pb = siblingCharge.pricing_breakdown as Record<string, unknown>
    const totalCents = typeof pb.total_cents === 'number' ? pb.total_cents : siblingCharge.amount_cents
    const perSessionCents = typeof pb.per_session_cents === 'number' ? pb.per_session_cents : siblingCharge.amount_cents
    return {
      priceCents: totalCents,
      basePriceCents: perSessionCents,
      morningSquadPartnerApplied: Boolean(pb.morning_squad_partner_applied),
      multiGroupApplied: typeof pb.multi_group_pct === 'number' && pb.multi_group_pct > 0,
      earlyBirdPct: typeof pb.early_bird_pct === 'number' ? pb.early_bird_pct : 0,
      inheritedFromTerm: true,
    }
  }

  // 3. Recompute fresh + apply today's active early-bird
  const std = await getPlayerSessionPriceBreakdown(supabase, familyId, programId, programType, playerId)
  const { data: program } = await supabase
    .from('programs')
    .select('early_pay_discount_pct, early_bird_deadline, early_pay_discount_pct_tier2, early_bird_deadline_tier2')
    .eq('id', programId)
    .maybeSingle()
  const eb = program ? getActiveEarlyBird(program) : { pct: 0, tier: null as 1 | 2 | null, deadline: null as string | null }
  const final = eb.pct > 0 ? Math.round(std.priceCents * (1 - eb.pct / 100)) : std.priceCents
  return { ...std, priceCents: final, earlyBirdPct: eb.pct, inheritedFromTerm: true }
}

export function isMultiGroupEligibleType(programType: string | null | undefined): boolean {
  return !!programType && (MULTI_GROUP_TYPES as readonly string[]).includes(programType)
}

/**
 * Returns $15 (cents) when the morning-squad cross-day partner rate applies,
 * or null when it doesn't. The rule: program is one of the morning squads
 * AND the player is already enrolled in the partner morning squad.
 */
async function getMorningSquadPartnerPrice(
  supabase: Supabase,
  programId: string,
  playerId: string,
): Promise<number | null> {
  const { data: prog } = await supabase
    .from('programs')
    .select('slug')
    .eq('id', programId)
    .maybeSingle()

  const slug = prog?.slug as string | null | undefined
  if (!slug || !(MORNING_SQUAD_SLUGS as readonly string[]).includes(slug)) return null

  const partnerSlug: MorningSquadSlug = slug === 'tue-morning-squad' ? 'wed-morning-squad' : 'tue-morning-squad'

  const { data: partner } = await supabase
    .from('programs')
    .select('id')
    .eq('slug', partnerSlug)
    .maybeSingle()
  if (!partner) return null

  const { data: roster } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', partner.id)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .maybeSingle()

  return roster ? 1500 : null
}

type EnrolmentRow = { program_id: string; enrolled_at: string }
type EnrolmentRowWithPrice = EnrolmentRow & { base_price_cents: number }

/**
 * Returns the player's currently-enrolled programs of multi-group-eligible
 * types ('group','squad'), ordered oldest first. Retained for any caller that
 * only needs the enrolment list (no longer used by the multi-group helper —
 * see `getPlayerEligibleEnrolmentsWithPrices`).
 */
export async function getPlayerEligibleEnrolments(
  supabase: Supabase,
  playerId: string,
): Promise<EnrolmentRow[]> {
  const { data } = await supabase
    .from('program_roster')
    .select('program_id, enrolled_at, programs!inner(type)')
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .in('programs.type', MULTI_GROUP_TYPES as unknown as string[])
    .order('enrolled_at', { ascending: true })

  if (!data) return []
  return data.map(r => ({ program_id: r.program_id, enrolled_at: r.enrolled_at as string }))
}

/**
 * As above, but also resolves each enrolment's effective base per-session price
 * (family_pricing override else program default). Used by the multi-group rule
 * which sorts by price DESC instead of enrolment age. Tie-break on equal
 * prices: older `enrolled_at` first.
 */
export async function getPlayerEligibleEnrolmentsWithPrices(
  supabase: Supabase,
  familyId: string,
  playerId: string,
): Promise<EnrolmentRowWithPrice[]> {
  const { data } = await supabase
    .from('program_roster')
    .select('program_id, enrolled_at, programs!inner(id, type, per_session_cents)')
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .in('programs.type', MULTI_GROUP_TYPES as unknown as string[])
    .order('enrolled_at', { ascending: true })

  if (!data || data.length === 0) return []

  const rows = data.map(r => {
    const programs = r.programs as { id?: string; type?: string | null; per_session_cents?: number | null } | null
    return {
      program_id: r.program_id,
      enrolled_at: r.enrolled_at as string,
      program_type: programs?.type ?? null,
    }
  })

  // Resolve effective base price for each enrolment via the existing RPC
  // (handles family_pricing overrides + program defaults consistently).
  const prices = await Promise.all(
    rows.map(r => getSessionPrice(supabase, familyId, r.program_id, r.program_type)),
  )

  return rows.map((r, i) => ({
    program_id: r.program_id,
    enrolled_at: r.enrolled_at,
    base_price_cents: prices[i],
  }))
}

/**
 * Build the discount-suffix label for charge descriptions when one or more
 * discounts apply. Returns null when no discount is active.
 */
export function formatDiscountSuffix({
  multiGroupApplied,
  earlyPayPct,
}: {
  multiGroupApplied: boolean
  earlyPayPct: number
}): string | null {
  const parts: string[] = []
  if (multiGroupApplied) parts.push(`${MULTI_GROUP_DISCOUNT_PCT}% multi-group`)
  if (earlyPayPct > 0) parts.push(`${earlyPayPct}% early-pay`)
  return parts.length ? parts.join(' + ') : null
}

/** Default copy used when a caller doesn't override. Kept here so the panel
 *  always has *something* to render even on legacy rows. */
export const DEFAULT_MULTI_GROUP_LABEL = 'Multi-group (25% off the 2nd group, per child)'
export const DEFAULT_EARLY_BIRD_LABEL = 'Early Bird Special'

export interface EarlyBirdMeta {
  /** Which tier was active at calculation time. */
  tier?: 1 | 2 | null
  /** ISO date (YYYY-MM-DD) the active tier ends. */
  deadline?: string | null
  /** Tier-2 percent if configured (used to render "drops to N% after" footnote when tier=1). */
  tier2Pct?: number | null
  /** Tier-2 deadline if configured. */
  tier2Deadline?: string | null
}

/**
 * Build the pricing_breakdown JSONB payload for a charge from a per-session
 * breakdown + (optional) sessions count + (optional) early-bird percent.
 *
 *  - For a single session: pass `sessions = 1` (or omit) and no early-bird.
 *  - For a term enrolment pay-now charge: pass `sessions = N` (term length)
 *    and the active early-bird percent.
 *
 * The total returned matches the math used at the call site so it can be
 * cross-checked against `amount_cents`.
 *
 * Optional `earlyBirdMeta` + `multiGroupLabel` + `earlyBirdLabel` thread the
 * named-discount + tier-deadline data into the JSON so PricingBreakdownPanel
 * can render "Early Bird Special — 15% off, ends 12-May" with a tier-2
 * footnote where applicable.
 */
export function buildPricingBreakdown({
  basePriceCents,
  perSessionPriceCents,
  morningSquadPartnerApplied,
  multiGroupApplied,
  sessions,
  earlyBirdPct,
  earlyBirdMeta,
  multiGroupLabel,
  earlyBirdLabel,
}: {
  /** The per-session base before multi-group (post-override, post-morning-squad-partner). */
  basePriceCents: number
  /** Final per-session price in cents (after multi-group). */
  perSessionPriceCents: number
  morningSquadPartnerApplied: boolean
  multiGroupApplied: boolean
  /** How many sessions this charge covers. Defaults to 1. */
  sessions?: number
  /** Active early-bird percent (e.g. 10, 15). 0 / undefined when not applied. */
  earlyBirdPct?: number
  /** Optional metadata for the early-bird tier/deadline footnote. */
  earlyBirdMeta?: EarlyBirdMeta | null
  /** Custom label for the multi-group line; defaults to DEFAULT_MULTI_GROUP_LABEL. */
  multiGroupLabel?: string
  /** Custom label for the early-bird line; defaults to DEFAULT_EARLY_BIRD_LABEL. */
  earlyBirdLabel?: string
}) {
  const n = sessions ?? 1
  const subtotal = basePriceCents * n
  const multiGroupOff = multiGroupApplied ? subtotal - perSessionPriceCents * n : 0
  const afterMultiGroup = subtotal - multiGroupOff
  const ebPct = earlyBirdPct ?? 0
  const earlyBirdOff = ebPct > 0 ? Math.round(afterMultiGroup * (ebPct / 100)) : 0
  const total = afterMultiGroup - earlyBirdOff

  const breakdown: Record<string, unknown> = {
    sessions: n,
    per_session_cents: basePriceCents,
    subtotal_cents: subtotal,
    morning_squad_partner_applied: morningSquadPartnerApplied,
    total_cents: total,
  }
  if (multiGroupApplied) {
    breakdown.multi_group_pct = MULTI_GROUP_DISCOUNT_PCT
    breakdown.multi_group_cents_off = multiGroupOff
    breakdown.multi_group_label = multiGroupLabel ?? DEFAULT_MULTI_GROUP_LABEL
  }
  if (ebPct > 0) {
    breakdown.early_bird_pct = ebPct
    breakdown.early_bird_cents_off = earlyBirdOff
    breakdown.early_bird_label = earlyBirdLabel ?? DEFAULT_EARLY_BIRD_LABEL
    if (earlyBirdMeta) {
      if (earlyBirdMeta.tier != null) breakdown.early_bird_tier = earlyBirdMeta.tier
      if (earlyBirdMeta.deadline) breakdown.early_bird_deadline = earlyBirdMeta.deadline
      // Only surface tier-2 footnote when tier-1 is active AND tier-2 is configured.
      if (earlyBirdMeta.tier === 1 && earlyBirdMeta.tier2Pct && earlyBirdMeta.tier2Pct > 0) {
        breakdown.tier2_pct = earlyBirdMeta.tier2Pct
        if (earlyBirdMeta.tier2Deadline) breakdown.tier2_deadline = earlyBirdMeta.tier2Deadline
      }
    }
  }
  return breakdown
}
