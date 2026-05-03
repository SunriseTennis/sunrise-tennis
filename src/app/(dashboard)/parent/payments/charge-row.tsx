'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateFriendly } from '@/lib/utils/dates'
import { ExternalLink, CreditCard, ChevronDown, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { usePayment } from './payment-context'

export type ChargeBadge = 'due' | 'scheduled' | 'paid'

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

export interface ChargeRowData {
  id: string
  description: string
  /** Original gross charge amount. Used for "of $Y" partial-payment context. */
  amountCents: number
  /** Sum of payment allocations applied to this charge (>= 0). */
  paidCents?: number
  /** Remaining balance: amountCents - paidCents (clamped >= 0). When omitted,
   *  legacy behaviour treats amountCents as the displayed value. */
  outstandingCents?: number
  playerName: string | null
  date: string | null
  badge: ChargeBadge
  sessionId?: string | null
  bookingId?: string | null
  programId?: string | null
  /** 'private' for private-lesson charges; 'group'/'squad' for program charges. */
  programType?: string | null
  /** Itemised pricing breakdown from charges.pricing_breakdown (when present). */
  pricingBreakdown?: PricingBreakdownData | null
}

const BADGE_STYLES: Record<ChargeBadge, string> = {
  due: 'bg-amber-100 text-amber-900 border border-amber-200',
  scheduled: 'bg-slate-100 text-slate-600 border border-slate-200',
  paid: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
}

const BADGE_LABELS: Record<ChargeBadge, string> = {
  due: 'Due now',
  scheduled: 'Scheduled',
  paid: 'Paid',
}

export function ChargeRow({
  charge,
  compact,
  isExpanded,
  onToggle,
}: {
  charge: ChargeRowData
  compact?: boolean
  isExpanded?: boolean
  onToggle?: () => void
}) {
  const payment = usePayment()
  const displayDate = charge.date ? formatDateFriendly(charge.date) : null
  const isPaid = charge.badge === 'paid'

  // Resolve display amount: outstanding (remaining) when available, otherwise gross.
  const displayCents = charge.outstandingCents ?? charge.amountCents
  const isPartiallyPaid =
    !isPaid &&
    typeof charge.paidCents === 'number' &&
    charge.paidCents > 0 &&
    typeof charge.outstandingCents === 'number' &&
    charge.outstandingCents > 0

  // Use props-based expand/collapse when provided (accordion mode)
  const expanded = isExpanded ?? false
  const handleToggle = onToggle ?? (() => {})

  return (
    <div>
      <button
        type="button"
        onClick={() => !isPaid && handleToggle()}
        disabled={isPaid}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
          !isPaid && 'hover:bg-muted/20 cursor-pointer',
          expanded && 'bg-muted/10',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
              BADGE_STYLES[charge.badge],
            )}>
              {BADGE_LABELS[charge.badge]}
            </span>
            {isPartiallyPaid && (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Partly paid
              </span>
            )}
            {displayDate && (
              <span className="text-xs text-muted-foreground tabular-nums">{displayDate}</span>
            )}
          </div>
          {!compact && (
            <p className="mt-1 text-sm text-foreground line-clamp-1">{charge.description}</p>
          )}
          {isPartiallyPaid && (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {formatCurrency(charge.paidCents!)} paid of {formatCurrency(charge.amountCents)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn(
            'tabular-nums font-semibold',
            isPaid ? 'text-muted-foreground line-through' :
            displayCents < 0 ? 'text-success' :
            charge.badge === 'due' ? 'text-amber-700' :
            'text-foreground',
          )}>
            {formatCurrency(displayCents)}
          </span>
          {!isPaid && (
            <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          )}
        </div>
      </button>

      {/* Action sheet */}
      {expanded && !isPaid && (
        <>
          {/* Breakdown panel — only shown when we have an itemised breakdown */}
          {charge.pricingBreakdown && (
            <div className="border-t border-border/30 bg-muted/5 px-4 py-2.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Breakdown</p>
              <div className="space-y-0.5 text-xs">
                {charge.pricingBreakdown.sessions != null && charge.pricingBreakdown.per_session_cents != null && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {charge.pricingBreakdown.sessions} {charge.pricingBreakdown.sessions === 1 ? 'session' : 'sessions'}
                      {' × '}
                      {formatCurrency(charge.pricingBreakdown.per_session_cents)}
                      {charge.pricingBreakdown.morning_squad_partner_applied ? ' (morning-squad pair)' : ''}
                    </span>
                    <span className="tabular-nums">{formatCurrency(charge.pricingBreakdown.subtotal_cents ?? 0)}</span>
                  </div>
                )}
                {charge.pricingBreakdown.multi_group_cents_off != null && charge.pricingBreakdown.multi_group_cents_off > 0 && (
                  <div className="flex justify-between text-success">
                    <span>– Multi-group ({charge.pricingBreakdown.multi_group_pct}%)</span>
                    <span className="tabular-nums">−{formatCurrency(charge.pricingBreakdown.multi_group_cents_off)}</span>
                  </div>
                )}
                {charge.pricingBreakdown.early_bird_cents_off != null && charge.pricingBreakdown.early_bird_cents_off > 0 && (
                  <div className="flex justify-between text-success">
                    <span>– Early-bird ({charge.pricingBreakdown.early_bird_pct}%)</span>
                    <span className="tabular-nums">−{formatCurrency(charge.pricingBreakdown.early_bird_cents_off)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/30 pt-0.5 font-semibold text-foreground">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(charge.pricingBreakdown.total_cents)}</span>
                </div>
              </div>
            </div>
          )}
          <div className="border-t border-border/30 bg-muted/5 px-4 py-2.5 flex flex-wrap gap-2">
            {/* Private-lesson charges → /parent/bookings/[bookingId].
                Privates have no program_id (so program_type from the join is null);
                booking_id presence is the reliable signal. */}
            {charge.bookingId && (
            <Link
              href={`/parent/bookings/${charge.bookingId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:shadow-card transition-all"
            >
              <ExternalLink className="size-3" />
              Go to lesson
            </Link>
          )}
          {/* Group/squad session charges → /parent/sessions/[sessionId] (added Plan 11).
              Skip when bookingId is set — that's a private and was handled above. */}
          {charge.sessionId && !charge.bookingId && (
            <Link
              href={`/parent/sessions/${charge.sessionId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:shadow-card transition-all"
            >
              <ExternalLink className="size-3" />
              Go to session
            </Link>
          )}
          {charge.programId && (
            <Link
              href={`/parent/programs/${charge.programId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:shadow-card transition-all"
            >
              <BookOpen className="size-3" />
              View program
            </Link>
          )}
          {charge.badge === 'due' && payment && (
            <button
              type="button"
              onClick={() => payment.requestPayment(displayCents, charge.description)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary shadow-sm hover:bg-primary/10 transition-all"
            >
              <CreditCard className="size-3" />
              Pay now
            </button>
          )}
          </div>
        </>
      )}
    </div>
  )
}
