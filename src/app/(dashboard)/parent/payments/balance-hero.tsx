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
}

/**
 * Shows the parent the right number for *this moment*. Four states:
 *
 *  1. Currently owed (confirmed < 0)
 *      "Currently owed $X — completed sessions awaiting payment"
 *  2. Usable credit (confirmed >= 0, projected > 0)
 *      "All paid up — $X usable credit"
 *  3. Pre-paid upcoming (confirmed >= 0, projected <= 0, prepaid > 0)
 *      "All paid up · $X applied to upcoming sessions"
 *      Important — this is the case the user flagged where it previously read
 *      "Credit on account" misleadingly. The amount is *prepaid commitment*,
 *      not money the parent can spend on something else.
 *  4. Otherwise → "All paid up"
 */
export function BalanceHero({
  confirmedBalanceCents,
  projectedBalanceCents,
  prepaidUpcomingCents,
}: Props) {
  const [showInfo, setShowInfo] = useState(false)

  let state: 'owed' | 'credit' | 'prepaid' | 'clear'
  if (confirmedBalanceCents < 0) state = 'owed'
  else if (projectedBalanceCents > 0) state = 'credit'
  else if (prepaidUpcomingCents > 0) state = 'prepaid'
  else state = 'clear'

  const headlineLabel = (
    state === 'owed' ? 'Currently owed' :
    state === 'credit' ? 'Usable credit' :
    state === 'prepaid' ? 'All paid up' :
    'All paid up'
  )

  const headlineAmountCents = (
    state === 'owed' ? confirmedBalanceCents :
    state === 'credit' ? projectedBalanceCents :
    state === 'prepaid' ? 0 :
    0
  )

  const subline = (
    state === 'owed' ? 'Completed sessions awaiting payment' :
    state === 'credit' ? 'Available for upcoming charges or refunds' :
    state === 'prepaid' ? `${formatCurrency(prepaidUpcomingCents)} applied to upcoming sessions` :
    'Future sessions are listed below as Scheduled'
  )

  const amountClass = (
    state === 'owed' ? 'text-red-200' :
    state === 'credit' ? 'text-emerald-200' :
    'text-white'
  )

  return (
    <ImageHero>
      <div className="flex items-center gap-2">
        <CreditCard className="size-5 text-white/80" />
        <p className="text-sm font-medium text-white/80">{headlineLabel}</p>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="rounded-full p-0.5 text-white/50 transition-colors hover:text-white/80"
          aria-label="Balance explanation"
        >
          <Info className="size-3.5" />
        </button>
      </div>

      {state === 'prepaid' ? (
        <p className="mt-2 text-3xl font-bold tabular-nums text-white">All paid up</p>
      ) : (
        <p className={`mt-2 text-3xl font-bold tabular-nums ${amountClass}`}>
          {formatCurrency(state === 'owed' ? -headlineAmountCents : headlineAmountCents)}
        </p>
      )}
      <p className="mt-0.5 text-xs text-white/60">{subline}</p>

      {showInfo && (
        <div className="mt-3 rounded-lg bg-white/15 px-3 py-2.5 text-xs text-white/90 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <p>
                <strong>Currently owed</strong> is what you owe for sessions that have already been delivered. It only goes up after a session runs — never before.
              </p>
              <p>
                <strong>Usable credit</strong> is money paid in excess of every charge on your account (past and scheduled). You can apply it to a future enrolment or request a refund.
              </p>
              <p>
                <strong>Applied to upcoming</strong> means you&apos;ve paid for term sessions that haven&apos;t run yet. You don&apos;t owe anything; the amount will work itself off session-by-session as the term progresses.
              </p>
              <p className="text-white/70">
                Scheduled future sessions appear in the list below as <em>Scheduled</em> &mdash; tap a row to see when each one will be billed.
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
    </ImageHero>
  )
}
