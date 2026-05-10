/**
 * Player-aware tennis ball. Reads `classifications` from the player and
 * renders a single ball for one classification or a multi-half-circle
 * ball for multiple.
 *
 * Use this for hero cards, profile graphics, dashboard tiles, and any
 * surface that has space for a 32px+ ball. For tiny inline indicators
 * (calendar dots) prefer keying on `getPrimaryClassification` directly.
 */

import { CLASSIFICATION_HEX, DEFAULT_BALL_COLOR, DEFAULT_BALL_HIGHLIGHT } from '@/lib/utils/level-colors'
import { getDisplayClassifications, type PlayerClassificationFields } from '@/lib/utils/player-display'
import { TennisBall, MultiBall } from './multi-ball'

const SIZES = { sm: 28, md: 40, lg: 56, xl: 72 } as const
type SizeKey = keyof typeof SIZES

export function PlayerBall({
  player,
  size = 'md',
}: {
  player: PlayerClassificationFields
  size?: SizeKey | number
}) {
  const px = typeof size === 'number' ? size : SIZES[size]
  const classes = getDisplayClassifications(player)

  if (classes.length === 0) {
    return <TennisBall color={DEFAULT_BALL_COLOR} highlight={DEFAULT_BALL_HIGHLIGHT} size={px} />
  }

  if (classes.length === 1) {
    const c = classes[0]
    const hex = CLASSIFICATION_HEX[c]
    return (
      <TennisBall
        color={hex?.color ?? DEFAULT_BALL_COLOR}
        highlight={hex?.highlight ?? DEFAULT_BALL_HIGHLIGHT}
        size={px}
      />
    )
  }

  // Multi: render the lowest two classifications as the half-balls.
  // (3+ classifications is rare/unsupported in copy; lowest two carries
  // the visual signal — the text label always lists them all.)
  const [left, right] = classes
  return (
    <MultiBall
      colors={[
        CLASSIFICATION_HEX[left]?.color ?? DEFAULT_BALL_COLOR,
        CLASSIFICATION_HEX[right]?.color ?? DEFAULT_BALL_COLOR,
      ]}
      size={px}
    />
  )
}
