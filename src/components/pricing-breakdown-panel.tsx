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
 * Synthesize a "bundle breakdown" by summing N per-row pricing breakdowns.
 * Invariant fields (per_session_cents, multi_group_pct, early_bird_pct,
 * labels, deadlines) come from the first row that has them; cents fields
 * sum across the bundle. Used by both `<ChargesList>` (term-level breakdown
 * inside an expanded service group) and `<PaymentHistory>` (bundle card
 * summary above the per-session row list) so the same "named discount,
 * total saved" UX shows everywhere a parent might look.
 *
 * Caller maps to a flat array of breakdowns (keeps this helper out of the
 * union-narrowing weeds for inputs that vary by snake_case vs camelCase
 * naming conventions). Returns null when no row carries a breakdown.
 */
export function aggregateBundleBreakdown(
  breakdowns: ReadonlyArray<PricingBreakdownData | null | undefined>,
): PricingBreakdownData | null {
  let perSession: number | undefined
  let morningSquadPartner: boolean | undefined
  let multiGroupPct: number | undefined
  let multiGroupLabel: string | undefined
  let earlyBirdPct: number | undefined
  let earlyBirdLabel: string | undefined
  let earlyBirdTier: 1 | 2 | undefined
  let earlyBirdDeadline: string | undefined
  let tier2Pct: number | undefined
  let tier2Deadline: string | undefined
  let subtotal = 0
  let multiGroupOff = 0
  let earlyBirdOff = 0
  let total = 0
  let sessions = 0
  let any = false

  for (const b of breakdowns) {
    if (!b) continue
    any = true
    sessions += b.sessions ?? 1
    subtotal += b.subtotal_cents ?? 0
    multiGroupOff += b.multi_group_cents_off ?? 0
    earlyBirdOff += b.early_bird_cents_off ?? 0
    total += b.total_cents ?? 0
    if (perSession === undefined && b.per_session_cents != null) perSession = b.per_session_cents
    if (morningSquadPartner === undefined && b.morning_squad_partner_applied != null) morningSquadPartner = b.morning_squad_partner_applied
    if (multiGroupPct === undefined && b.multi_group_pct != null) multiGroupPct = b.multi_group_pct
    if (multiGroupLabel === undefined && b.multi_group_label) multiGroupLabel = b.multi_group_label
    if (earlyBirdPct === undefined && b.early_bird_pct != null) earlyBirdPct = b.early_bird_pct
    if (earlyBirdLabel === undefined && b.early_bird_label) earlyBirdLabel = b.early_bird_label
    if (earlyBirdTier === undefined && b.early_bird_tier != null) earlyBirdTier = b.early_bird_tier
    if (earlyBirdDeadline === undefined && b.early_bird_deadline) earlyBirdDeadline = b.early_bird_deadline
    if (tier2Pct === undefined && b.tier2_pct != null) tier2Pct = b.tier2_pct
    if (tier2Deadline === undefined && b.tier2_deadline) tier2Deadline = b.tier2_deadline
  }

  if (!any) return null
  return {
    sessions,
    per_session_cents: perSession,
    subtotal_cents: subtotal,
    morning_squad_partner_applied: morningSquadPartner,
    multi_group_pct: multiGroupPct,
    multi_group_cents_off: multiGroupOff > 0 ? multiGroupOff : undefined,
    multi_group_label: multiGroupLabel,
    early_bird_pct: earlyBirdPct,
    early_bird_cents_off: earlyBirdOff > 0 ? earlyBirdOff : undefined,
    early_bird_label: earlyBirdLabel,
    early_bird_tier: earlyBirdTier,
    early_bird_deadline: earlyBirdDeadline,
    tier2_pct: tier2Pct,
    tier2_deadline: tier2Deadline,
    total_cents: total,
  }
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
