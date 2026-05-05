import { formatCurrency } from '@/lib/utils/currency'
import { formatDateFriendly } from '@/lib/utils/dates'

export interface PricingBreakdownData {
  sessions?: number
  per_session_cents?: number
  subtotal_cents?: number
  morning_squad_partner_applied?: boolean
  multi_group_pct?: number
  multi_group_cents_off?: number
  multi_group_label?: string
  early_bird_pct?: number
  early_bird_cents_off?: number
  early_bird_label?: string
  early_bird_tier?: 1 | 2
  early_bird_deadline?: string
  /** Tier-2 metadata when tier-1 is currently active. Used to render the
   *  "drops to N% after DD-MMM" footnote so parents see the discount cliff. */
  tier2_pct?: number
  tier2_deadline?: string
  total_cents: number
  // Adjustment-charge fields (Phase D — multi-group reversed when an anchor is unenrolled)
  adjustment_for_charge_id?: string
  adjustment_reason?: 'multi_group_no_longer_eligible' | 'morning_squad_partner_lost'
  original_charge_description?: string
  surrendered_multi_group_cents_off?: number
  residual_early_bird_pct?: number
}

interface Props {
  breakdown: PricingBreakdownData
  /** Optional heading — defaults to "Breakdown". Pass null to suppress. */
  heading?: string | null
  /** Optional class on the outer wrapper. */
  className?: string
}

const ADJUSTMENT_REASON_COPY: Record<NonNullable<PricingBreakdownData['adjustment_reason']>, string> = {
  multi_group_no_longer_eligible:
    'The 25% multi-group discount applied when the second program was paid. With that program withdrawn, the discount no longer applies and the difference is owed.',
  morning_squad_partner_lost:
    'The $15 morning-squad partner rate applied while the cross-day partner was enrolled. With that partner withdrawn, the partner rate no longer applies and the difference is owed.',
}

/**
 * Itemised pricing breakdown panel for a charge with a non-null
 * `charges.pricing_breakdown`. Renders the per-session line, any active
 * discounts (multi-group, early-bird), and the total. Also handles the
 * adjustment-charge variant — when `adjustment_reason` is set, the panel
 * explains *why* the charge was created.
 *
 * Used both by `<ChargeRow>` (current charges) and `<PaymentHistory>`
 * (settled payments) so allocations against a term-enrolment charge
 * surface the same breakdown that informed the original price.
 */
export function PricingBreakdownPanel({ breakdown, heading = 'Breakdown', className }: Props) {
  const isAdjustment = breakdown.adjustment_reason != null

  return (
    <div className={className ?? 'border-t border-border/30 bg-muted/5 px-4 py-2.5'}>
      {heading && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {isAdjustment ? 'Adjustment' : heading}
        </p>
      )}

      {/* Adjustment-charge variant: explanation block */}
      {isAdjustment && breakdown.adjustment_reason && (
        <div className="mb-2 space-y-1 text-xs text-muted-foreground">
          <p className="text-foreground">{ADJUSTMENT_REASON_COPY[breakdown.adjustment_reason]}</p>
          {breakdown.original_charge_description && (
            <p>
              <span className="font-medium">Original charge:</span> {breakdown.original_charge_description}
            </p>
          )}
          {breakdown.surrendered_multi_group_cents_off != null && (
            <p>
              <span className="font-medium">Multi-group reversed:</span>{' '}
              {formatCurrency(breakdown.surrendered_multi_group_cents_off)}
              {breakdown.residual_early_bird_pct != null && breakdown.residual_early_bird_pct > 0 && (
                <span> · early-bird ({breakdown.residual_early_bird_pct}%) stays applied</span>
              )}
            </p>
          )}
        </div>
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
            <span>
              – {breakdown.multi_group_label ?? 'Multi-group'}
              {breakdown.multi_group_pct != null && !breakdown.multi_group_label?.includes('%') && (
                <> ({breakdown.multi_group_pct}%)</>
              )}
            </span>
            <span className="tabular-nums">−{formatCurrency(breakdown.multi_group_cents_off)}</span>
          </div>
        )}
        {breakdown.early_bird_cents_off != null && breakdown.early_bird_cents_off > 0 && (
          <>
            <div className="flex justify-between text-success">
              <span>
                – {breakdown.early_bird_label ?? 'Early-bird'} ({breakdown.early_bird_pct}%
                {breakdown.early_bird_deadline && (
                  <>, ends {formatDateFriendly(breakdown.early_bird_deadline)}</>
                )}
                )
              </span>
              <span className="tabular-nums">−{formatCurrency(breakdown.early_bird_cents_off)}</span>
            </div>
            {breakdown.early_bird_tier === 1 && breakdown.tier2_pct != null && breakdown.tier2_pct > 0 && (
              <div className="text-[11px] text-muted-foreground/80 pl-2">
                After {breakdown.early_bird_deadline ? formatDateFriendly(breakdown.early_bird_deadline) : 'the deadline'} this drops to {breakdown.tier2_pct}%
                {breakdown.tier2_deadline && (
                  <> until {formatDateFriendly(breakdown.tier2_deadline)}</>
                )}
                .
              </div>
            )}
          </>
        )}
        <div className="flex justify-between border-t border-border/30 pt-0.5 font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(breakdown.total_cents)}</span>
        </div>
      </div>
    </div>
  )
}
