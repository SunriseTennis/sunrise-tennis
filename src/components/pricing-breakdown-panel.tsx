import { formatCurrency } from '@/lib/utils/currency'

export interface PricingBreakdownData {
  sessions?: number
  per_session_cents?: number
  subtotal_cents?: number
  morning_squad_partner_applied?: boolean
  multi_group_pct?: number
  multi_group_cents_off?: number
  early_bird_pct?: number
  early_bird_cents_off?: number
  total_cents: number
}

interface Props {
  breakdown: PricingBreakdownData
  /** Optional heading — defaults to "Breakdown". Pass null to suppress. */
  heading?: string | null
  /** Optional class on the outer wrapper. */
  className?: string
}

/**
 * Itemised pricing breakdown panel for a charge with a non-null
 * `charges.pricing_breakdown`. Renders the per-session line, any active
 * discounts (multi-group, early-bird), and the total.
 *
 * Used both by `<ChargeRow>` (current charges) and `<PaymentHistory>`
 * (settled payments) so allocations against a term-enrolment charge
 * surface the same breakdown that informed the original price.
 */
export function PricingBreakdownPanel({ breakdown, heading = 'Breakdown', className }: Props) {
  return (
    <div className={className ?? 'border-t border-border/30 bg-muted/5 px-4 py-2.5'}>
      {heading && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>
      )}
      <div className="space-y-0.5 text-xs">
        {breakdown.sessions != null && breakdown.per_session_cents != null && (
          <div className="flex justify-between text-muted-foreground">
            <span>
              {breakdown.sessions} {breakdown.sessions === 1 ? 'session' : 'sessions'}
              {' × '}
              {formatCurrency(breakdown.per_session_cents)}
              {breakdown.morning_squad_partner_applied ? ' (morning-squad pair)' : ''}
            </span>
            <span className="tabular-nums">{formatCurrency(breakdown.subtotal_cents ?? 0)}</span>
          </div>
        )}
        {breakdown.multi_group_cents_off != null && breakdown.multi_group_cents_off > 0 && (
          <div className="flex justify-between text-success">
            <span>– Multi-group ({breakdown.multi_group_pct}%)</span>
            <span className="tabular-nums">−{formatCurrency(breakdown.multi_group_cents_off)}</span>
          </div>
        )}
        {breakdown.early_bird_cents_off != null && breakdown.early_bird_cents_off > 0 && (
          <div className="flex justify-between text-success">
            <span>– Early-bird ({breakdown.early_bird_pct}%)</span>
            <span className="tabular-nums">−{formatCurrency(breakdown.early_bird_cents_off)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border/30 pt-0.5 font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(breakdown.total_cents)}</span>
        </div>
      </div>
    </div>
  )
}
