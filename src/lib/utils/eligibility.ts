/**
 * Program eligibility rules.
 *
 * A player can enrol in a program when:
 *   1. Gender matches (or program has no gender_restriction)
 *   2. Track matches (program.track_required NULL, or player.track === required)
 *   3. Classifications overlap with program.allowed_classifications, with one
 *      Thursday-specific twist (see below).
 *
 * Thursday rule (Maxim 01-May-2026):
 *   For programs on Thursday with track_required = 'performance', a multi-class
 *   player must use their LOWEST classification. So a player ['red','orange']
 *   on Thursday can only enrol in Red Squad — not Orange. Other days: any-match.
 */

export type Classification =
  | 'blue' | 'red' | 'orange' | 'green' | 'yellow' | 'advanced' | 'elite'

/**
 * Lowest-to-highest classification order. Lower index = lower classification.
 */
export const CLASSIFICATION_ORDER: Classification[] = [
  'blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite',
]

export type Gender = 'male' | 'female' | 'non_binary' | null | undefined

export interface PlayerEligibilityFields {
  classifications: string[] | null | undefined
  track: string | null | undefined
  gender: Gender
}

export interface ProgramEligibilityFields {
  day_of_week: number | null | undefined
  allowed_classifications: string[] | null | undefined
  track_required: string | null | undefined
  gender_restriction: string | null | undefined
}

/** Index of a classification in the order list, or 99 for unknown. */
function rank(c: string): number {
  const i = CLASSIFICATION_ORDER.indexOf(c as Classification)
  return i === -1 ? 99 : i
}

/** Lowest classification of a player. Returns null if the player has none. */
export function lowestClassification(classifications: string[] | null | undefined): string | null {
  if (!classifications || classifications.length === 0) return null
  let lowest = classifications[0]
  for (const c of classifications) {
    if (rank(c) < rank(lowest)) lowest = c
  }
  return lowest
}

export interface EligibilityResult {
  ok: boolean
  /** Why enrolment is blocked. Null when ok = true. */
  reason: null | 'gender' | 'track' | 'classification'
  /** Human-readable explanation, safe to surface to parents. */
  message: null | string
}

const OK: EligibilityResult = { ok: true, reason: null, message: null }

/**
 * Returns whether a player can enrol in a program. Pure function — no DB calls.
 */
export function isEligible(
  player: PlayerEligibilityFields,
  program: ProgramEligibilityFields,
): EligibilityResult {
  // Gender restriction
  if (program.gender_restriction) {
    if (!player.gender || player.gender !== program.gender_restriction) {
      return {
        ok: false,
        reason: 'gender',
        message: `This program is for ${program.gender_restriction} players only.`,
      }
    }
  }

  // Track restriction (e.g. Thursday + morning performance squads)
  if (program.track_required && program.track_required !== player.track) {
    return {
      ok: false,
      reason: 'track',
      message: `This program is for ${program.track_required} track players only.`,
    }
  }

  // Classification matching
  const allowed = program.allowed_classifications ?? []
  const playerClasses = player.classifications ?? []

  if (allowed.length === 0) {
    // No restriction set → eligible (back-compat for legacy programs).
    return OK
  }

  if (playerClasses.length === 0) {
    return {
      ok: false,
      reason: 'classification',
      message: 'Player has no skill classification yet. Ask your coach to set one.',
    }
  }

  // Thursday + performance: lowest classification only
  const isThursdayPerformance =
    program.day_of_week === 4 && program.track_required === 'performance'

  if (isThursdayPerformance) {
    const lowest = lowestClassification(playerClasses)
    if (!lowest || !allowed.includes(lowest)) {
      return {
        ok: false,
        reason: 'classification',
        message: `On Thursdays players use their lowest classification. ${lowest ?? 'Unknown'} doesn't match this squad.`,
      }
    }
    return OK
  }

  // Any other day: any-classification match
  const overlap = playerClasses.some((c) => allowed.includes(c))
  if (!overlap) {
    return {
      ok: false,
      reason: 'classification',
      message: `Player's classifications (${playerClasses.join(', ')}) don't match this program.`,
    }
  }

  return OK
}

// ── Early-bird tiers ──────────────────────────────────────────────────────────

export interface EarlyBirdInputs {
  early_pay_discount_pct: number | null | undefined
  early_bird_deadline: string | null | undefined
  early_pay_discount_pct_tier2: number | null | undefined
  early_bird_deadline_tier2: string | null | undefined
}

/**
 * Returns the active early-bird discount percent for today, or 0 if expired.
 * Tier 1 wins when today <= tier1_deadline; otherwise tier 2 if today <= tier2_deadline.
 */
export function getActiveEarlyBird(
  inputs: EarlyBirdInputs,
  todayStr: string = new Date().toISOString().split('T')[0],
): { pct: number; tier: 1 | 2 | null; deadline: string | null } {
  const t1Pct = inputs.early_pay_discount_pct ?? 0
  const t1Deadline = inputs.early_bird_deadline ?? null
  const t2Pct = inputs.early_pay_discount_pct_tier2 ?? 0
  const t2Deadline = inputs.early_bird_deadline_tier2 ?? null

  if (t1Pct > 0 && t1Deadline && todayStr <= t1Deadline) {
    return { pct: t1Pct, tier: 1, deadline: t1Deadline }
  }
  if (t2Pct > 0 && t2Deadline && todayStr <= t2Deadline) {
    return { pct: t2Pct, tier: 2, deadline: t2Deadline }
  }
  return { pct: 0, tier: null, deadline: null }
}
