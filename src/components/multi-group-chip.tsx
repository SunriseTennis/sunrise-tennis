import { Tag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'
import { MULTI_GROUP_DISCOUNT_PCT } from '@/lib/utils/player-pricing'

interface MultiGroupChipProps {
  /**
   * 'applied'   — the 25% multi-group discount is currently being applied to
   *               whatever the user is about to enrol in. Green/success tone.
   * 'available' — the player would qualify (already has 1+ eligible enrolment,
   *               or has 0 and would qualify on enrolling 2). Amber/info tone.
   *               Use to entice on program cards / banners.
   */
  state: 'applied' | 'available'
  /** Player first name to personalise the message. Optional. */
  playerName?: string | null
  /** Cents saved on this booking — only rendered when state='applied'. */
  savingsCents?: number | null
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Surfaces the 25% multi-group discount at booking / browsing time. Mirrors
 * the <CreditChip> pattern.
 */
export function MultiGroupChip({ state, playerName, savingsCents, className, size = 'sm' }: MultiGroupChipProps) {
  const padding = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]'
  const iconSize = size === 'md' ? 'size-3.5' : 'size-3'

  let label: string
  let toneClass: string

  if (state === 'applied') {
    const savings = savingsCents && savingsCents > 0 ? ` · saved ${formatCurrency(savingsCents)}` : ''
    label = `${MULTI_GROUP_DISCOUNT_PCT}% multi-group off${playerName ? ` for ${playerName}` : ''}${savings}`
    toneClass = 'bg-emerald-50 border-emerald-200 text-emerald-800'
  } else {
    label = playerName
      ? `Save ${MULTI_GROUP_DISCOUNT_PCT}% on ${playerName}'s 2nd group`
      : `Save ${MULTI_GROUP_DISCOUNT_PCT}% on the 2nd group`
    toneClass = 'bg-amber-50 border-amber-200 text-amber-800'
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-medium', padding, toneClass, className)}>
      <Tag className={iconSize} />
      {label}
    </span>
  )
}
