import { Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

interface CreditChipProps {
  /** Family's REAL spendable credit in cents — positive only when total
   *  payments exceed total active charges (i.e. `projected_balance_cents > 0`).
   *  Pass 0 or negative to render nothing. Do NOT pass `confirmed_balance_cents`
   *  here — that's "payments minus delivered-completed only" and overstates
   *  spendability when the family has upcoming commitments. */
  creditCents: number
  /** Cost of the thing being booked / enrolled in cents. Pass 0 to show generic credit pill. */
  costCents?: number | null
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Surfaces the family's available credit at booking / enrolment time.
 *
 * Renders nothing when credit is 0 or negative.
 * Variants:
 *   - cost <= 0 or null: "$155 credit available"
 *   - credit >= cost:    "Covered by your $155 credit"
 *   - 0 < credit < cost: "Pay $50 after $40 credit"
 *
 * Semantic established 05-May-2026: callers MUST source credit from
 * `projected_balance_cents`, not `confirmed_balance_cents`. The chip should
 * only appear when the family has a real spendable surplus after netting
 * all known future commitments.
 */
export function CreditChip({ creditCents, costCents = null, className, size = 'sm' }: CreditChipProps) {
  if (!creditCents || creditCents <= 0) return null

  const cost = costCents ?? 0
  const padding = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]'
  const iconSize = size === 'md' ? 'size-3.5' : 'size-3'

  let label: string
  let tone: 'success' | 'info'

  if (cost <= 0) {
    label = `${formatCurrency(creditCents)} credit available`
    tone = 'info'
  } else if (creditCents >= cost) {
    label = `Covered by your ${formatCurrency(creditCents)} credit`
    tone = 'success'
  } else {
    const after = cost - creditCents
    label = `Pay ${formatCurrency(after)} after ${formatCurrency(creditCents)} credit`
    tone = 'info'
  }

  const toneClass = tone === 'success'
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : 'bg-amber-50 border-amber-200 text-amber-800'

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-medium', padding, toneClass, className)}>
      <Sparkles className={iconSize} />
      {label}
    </span>
  )
}
