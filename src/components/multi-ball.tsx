/**
 * Tennis ball SVG primitives.
 *
 * `<TennisBall>` — single-colour ball. Used for one-classification players
 * and as the fallback inside `<MultiBall>` when fewer than two colours
 * are passed.
 *
 * `<MultiBall>` — two-half-circle ball used for multi-classification
 * players (e.g. yellow + advanced) and previously the schools landing-page
 * card. Falls back to `<TennisBall>` for one or zero colours.
 *
 * Both accept raw hex strings so they're palette-agnostic. For
 * player-aware rendering see `<PlayerBall>`.
 */

import { DEFAULT_BALL_COLOR, DEFAULT_BALL_HIGHLIGHT } from '@/lib/utils/level-colors'

export function TennisBall({
  color,
  highlight,
  size = 64,
}: {
  color: string
  highlight: string
  size?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" fill={color} />
      <circle cx="32" cy="32" r="30" fill="url(#ballShine)" />
      <path d="M12 16C20 28 20 36 12 48" stroke={highlight} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <path d="M52 16C44 28 44 36 52 48" stroke={highlight} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <defs>
        <radialGradient id="ballShine" cx="0.35" cy="0.3" r="0.65">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

export function MultiBall({ colors, size = 56 }: { colors: string[]; size?: number }) {
  if (colors.length < 2) {
    return (
      <TennisBall
        color={colors[0] ?? DEFAULT_BALL_COLOR}
        highlight={DEFAULT_BALL_HIGHLIGHT}
        size={size}
      />
    )
  }
  const [left, right] = colors
  // Generate unique clip-path ids per render so multiple multi-balls on
  // the same page don't clash.
  const uid = Math.random().toString(36).slice(2, 8)
  const leftId = `mb-l-${uid}`
  const rightId = `mb-r-${uid}`
  const shineId = `mb-s-${uid}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={leftId}><rect x="0" y="0" width="32" height="64" /></clipPath>
        <clipPath id={rightId}><rect x="32" y="0" width="32" height="64" /></clipPath>
        <radialGradient id={shineId} cx="0.35" cy="0.3" r="0.65">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={left} clipPath={`url(#${leftId})`} />
      <circle cx="32" cy="32" r="30" fill={right} clipPath={`url(#${rightId})`} />
      <circle cx="32" cy="32" r="30" fill={`url(#${shineId})`} />
      <path d="M32 2 L32 62" stroke="white" strokeWidth="1.5" opacity="0.45" />
    </svg>
  )
}
