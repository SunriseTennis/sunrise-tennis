import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getSessionPrice } from './billing'

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
 *   3. 25% multi-group discount per player. Applies when this charge is NOT
 *      for the player's oldest currently-enrolled program of an eligible type
 *      ('group','squad'). Recalculated on every billing event so dropping the
 *      "first" program promotes the next-oldest to full price going forward.
 *      For a casual booking on a program the player isn't on the roster of,
 *      having any other eligible enrolment makes the casual "additional" and
 *      qualifies it for 25% off.
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

  const enrolments = await getPlayerEligibleEnrolments(supabase, playerId)
  if (enrolments.length === 0) {
    return { priceCents: basePrice, basePriceCents: basePrice, morningSquadPartnerApplied: false, multiGroupApplied: false }
  }

  // Multi-group fires when this charge is NOT for the player's oldest eligible enrolment.
  // For a casual booking on a non-enrolled program, the oldest will be some other program,
  // so the rule naturally treats the casual as "additional" (25% off) — which is what we want.
  const oldest = enrolments[0]
  const multiGroupApplied = oldest?.program_id !== programId

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

/**
 * Returns the player's currently-enrolled programs of multi-group-eligible
 * types ('group','squad'), ordered oldest first. Used to compute the 25%
 * multi-group ordinal.
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
