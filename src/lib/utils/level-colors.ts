/**
 * Canonical hex map for player classifications (and the legacy "level"
 * column on programs which still uses the same vocabulary). Single source
 * of truth for any surface that needs raw hex — SVG balls, gradient
 * accents, dot indicators.
 *
 * For tailwind classes (`bg-ball-red` etc.) consumers should keep using
 * the existing class names — those are defined in `tailwind.config` and
 * already match these values.
 */

export const CLASSIFICATION_HEX: Record<string, { color: string; highlight: string }> = {
  blue:     { color: '#4A90D9', highlight: '#6BB0F0' },
  red:      { color: '#C53030', highlight: '#E25555' },
  orange:   { color: '#E86A20', highlight: '#F59042' },
  green:    { color: '#2D8A4E', highlight: '#44B06E' },
  yellow:   { color: '#EAB308', highlight: '#F4C430' },
  advanced: { color: '#8B5A2B', highlight: '#B07840' },
  elite:    { color: '#1A2332', highlight: '#3A4352' },
}

/** Convenience: just the body colour. */
export const CLASSIFICATION_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(CLASSIFICATION_HEX).map(([k, v]) => [k, v.color]),
)

/** Default fallback for unknown / empty classifications. */
export const DEFAULT_BALL_COLOR = '#2B5EA7'
export const DEFAULT_BALL_HIGHLIGHT = '#FFFFFF'
