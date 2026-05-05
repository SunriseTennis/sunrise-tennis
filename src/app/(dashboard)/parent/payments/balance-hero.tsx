'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { ImageHero } from '@/components/image-hero'
import { CreditCard, Info, X } from 'lucide-react'

interface Props {
  /** Negative = owed for delivered sessions; positive = excess paid (could be prepaid OR usable credit). */
  confirmedBalanceCents: number
  /** Negative = owed in total (incl. scheduled future); positive = real usable credit (excess of all charges). */
  projectedBalanceCents: number
  /** Sum of allocations attached to scheduled future per-session charges. Positive number. */
  prepaidUpcomingCents: number
  /** Sum of OUTSTANDING (still owed) cents on future-scheduled charges. Positive number. */
  upcomingOutstandingCents: number
}

/**
 * Hero displays the parent's overall account state in a single primary
 * number, plus a secondary line showing what's still upcoming. Designed so
 * the parent can see "current credit" and "what's owed" at a glance without
 * the confusing double-up of an "All paid up" label sitting above an "All
 * paid up" headline.
 *
 * Primary number: `projected_balance_cents` — the true net position
 *   (payments minus all active charges). This avoids the misleading
 *   "Credit on account" label that `confirmed_balance` produces when a
 *   parent has just prepaid for upcoming sessions.
 *
 * Secondary line: "Upcoming: $X scheduled" with an inline note when some
 *   of that upcoming has already been paid for ("$Y already paid").
 */
export function BalanceHero({
  confirmedBalanceCents,
  projectedBalanceCents,
  prepaidUpcomingCents,
  upcomingOutstandingCents,
}: Props) {
  const [showInfo, setShowInfo] = useState(false)

  const owedNow = confirmedBalanceCents < 0
  const realCredit = projectedBalanceCents > 0
  const allClear = !owedNow && !realCredit

  const headlineColor = owedNow ? 'text-red-200' : realCredit ? 'text-emerald-200' : 'text-white'
  const headlineCents = owedNow
    ? -confirmedBalanceCents // show as positive in the headline; subline reads "owed"
    : realCredit
      ? projectedBalanceCents
      : 0

  const headlineSign = owedNow ? '−' : realCredit ? '+' : ''
  const headlineSubline = owedNow
    ? 'Owed for delivered sessions'
    : realCredit
      ? 'Usable credit on your account'
      : 'Account up to date'

  const upcomingTotalCents = upcomingOutstandingCents + prepaidUpcomingCents

  return (
    <ImageHero>
      <div className="flex items-center gap-2">
        <CreditCard className="size-5 text-white/80" />
        <p className="text-sm font-medium text-white/80">Current Balance</p>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="rounded-full p-0.5 text-white/50 transition-colors hover:text-white/80"
          aria-label="Balance explanation"
        >
          <Info className="size-3.5" />
        </button>
      </div>

      <p className={`mt-2 text-3xl font-bold tabular-nums ${headlineColor}`}>
        {headlineSign}{formatCurrency(headlineCents)}
      </p>
      <p className="mt-0.5 text-xs text-white/60">{headlineSubline}</p>

      {/* Secondary line — what's still ahead */}
      {upcomingTotalCents > 0 && (
        <div className="mt-3 flex items-baseline justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/85 backdrop-blur-sm">
          <span className="font-medium">Upcoming</span>
          <span className="text-right tabular-nums">
            <span className="font-semibold">{formatCurrency(upcomingTotalCents)}</span>
            {prepaidUpcomingCents > 0 && (
              <>
                {' '}
                <span className="text-[11px] text-white/60">
                  ({formatCurrency(prepaidUpcomingCents)} already paid)
                </span>
              </>
            )}
          </span>
        </div>
      )}

      {showInfo && (
        <div className="mt-3 rounded-lg bg-white/15 px-3 py-2.5 text-xs text-white/90 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <p>
                <strong>Current Balance</strong> is your overall account position right now.
                Negative = owing, positive = usable credit, zero = settled.
              </p>
              <p>
                <strong>Upcoming</strong> is the total of every future-scheduled session that&apos;s
                been booked or enroled. The &quot;already paid&quot; portion is what you&apos;ve pre-paid
                for term sessions that haven&apos;t run yet.
              </p>
              <p className="text-white/70">
                The current balance only goes up when a session actually runs. Cancellations
                shrink the upcoming, never the current balance.
              </p>
            </div>
            <button
              onClick={() => setShowInfo(false)}
              className="shrink-0 rounded-full p-0.5 text-white/50 hover:text-white/80"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Visually-quiet hint when nothing's owed and nothing's upcoming */}
      {allClear && upcomingTotalCents === 0 && (
        <p className="mt-2 text-xs text-white/55">No upcoming charges right now.</p>
      )}
    </ImageHero>
  )
}
