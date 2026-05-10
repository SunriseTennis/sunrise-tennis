/**
 * Player display helpers.
 *
 * Plan 24 retired `players.ball_color` and `players.level` — the only
 * source of truth for what a player "is" is `classifications text[]`,
 * which can carry one or many of: blue, red, orange, green, yellow,
 * advanced, elite. These helpers turn that array into a stable display:
 *
 *   getDisplayClassifications(p)    — sorted lowest→highest
 *   getPrimaryClassification(p)     — single value for fallback visuals
 *   formatClassificationsLabel(p)   — "Yellow / Advanced"
 *
 * For the actual ball graphic see `<PlayerBall>`.
 */

import { CLASSIFICATION_ORDER } from './eligibility'

export interface PlayerClassificationFields {
  classifications?: string[] | null
}

function rank(c: string): number {
  const i = CLASSIFICATION_ORDER.indexOf(c as never)
  return i === -1 ? 99 : i
}

/** Returns classifications sorted lowest→highest for stable rendering. */
export function getDisplayClassifications(p: PlayerClassificationFields): string[] {
  const list = [...(p.classifications ?? [])]
  return list.sort((a, b) => rank(a) - rank(b))
}

/**
 * Lowest classification — drives single-ball visual fallback (calendar
 * accent, small dot indicators) where rendering N coloured balls isn't
 * practical. Returns null for players with no classifications.
 */
export function getPrimaryClassification(p: PlayerClassificationFields): string | null {
  const list = getDisplayClassifications(p)
  return list[0] ?? null
}

/** Human-readable label for inline text. "Yellow / Advanced", or '' when empty. */
export function formatClassificationsLabel(p: PlayerClassificationFields): string {
  const list = getDisplayClassifications(p)
  if (list.length === 0) return ''
  return list.map(c => c[0].toUpperCase() + c.slice(1)).join(' / ')
}

/** True iff the player carries 2+ classifications. */
export function hasMultipleClassifications(p: PlayerClassificationFields): boolean {
  return (p.classifications ?? []).length >= 2
}
