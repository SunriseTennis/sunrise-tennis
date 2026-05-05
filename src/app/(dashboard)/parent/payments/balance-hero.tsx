'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { ImageHero } from '@/components/image-hero'
import { CreditCard, Info, X } from 'lucide-react'

interface Props {
  /** Headline = availableCredit − dueOutstanding. Signed: negative = net owed,
   *  positive = real spendable credit, zero = settled for delivered work. */
  accountBalanceCents: number
  /** Always >= 0. Excess of payments over all active charges. Used in the
   *  split-state explainer when the parent has both spendable credit AND
   *  immediate due-now items (rare under FIFO; possible after targeted-first
   *  prepay against a future charge). */
  availableCreditCents: number
  /** Sum of OUTSTANDING (still owed) on charges classified as `due` by
   *  ChargesList (past sessions, sessionless adjustments, missing-date rows). */
  dueOutstandingCents: number
  /** Sum of OUTSTANDING on charges with future-scheduled sessions. */
  upcomingOutstandingCents: number
}

/**
 * Hero showing the parent's account state in one number with two supporting
 * lines. Replaces the prior "Current Balance = projected_balance" framing
 * which produced confusing "Account up to date" copy when the parent had
 * delivered-but-unpaid sessions on the books (`projected = 0` because future
 * commitments offset prior payments).
 *
 * New shape (per Maxim 05-May-2026):
 *
 *     Account balance
 *     −$220.00              ← red when net owed
 *     Due now for past or delivered sessions
 *
 *     Upcoming: $625.50    ← scheduled-and-not-paid; pay-when-ready
 *
 * The headline is `availableCredit − dueOutstanding`. Both are non-negative
 * so the difference cleanly maps to:
 *   < 0  → net owed (red)
 *   > 0  → real spendable credit (emerald)
 *   = 0  → settled-for-delivered (white)
 */
export function BalanceHero({
  accountBalanceCents,
  availableCreditCents,
  dueOutstandingCents,
  upcomingOutstandingCents,
}: Props) {
  const [showInfo, setShowInfo] = useState(false)

  const isOwed = accountBalanceCents < 0
  const hasCredit = accountBalanceCents > 0
  const isSettled = accountBalanceCents === 0

  const headlineColor = isOwed ? 'text-red-200' : hasCredit ? 'text-emerald-200' : 'text-white'
  const headlineSign = isOwed ? '−' : hasCredit ? '+' : ''
  const headlineCents = Math.abs(accountBalanceCents)

  const headlineSubline = isOwed
    ? 'Due now for past or delivered sessions'
    : hasCredit
      ? 'Credit on your account'
      : 'All paid up for delivered sessions'

  // Split state: family has BOTH unallocated credit AND due-now items.
  // FIFO normally allocates oldest-first so this is rare, but targeted-first
  // pay-now (Plan 14) can produce it. Surface in the info panel so parents
  // see why credit > 0 didn't auto-zero the due column.
  const isSplit = availableCreditCents > 0 && dueOutstandingCents > 0

  return (
    <ImageHero>
      <div className="flex items-center gap-2">
        <CreditCard className="size-5 text-white/80" />
        <p className="text-sm font-medium text-white/80">Account balance</p>
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

      {/* Upcoming pill — scheduled-and-still-owing (live values, matches ChargesList). */}
      {upcomingOutstandingCents > 0 && (
        <div className="mt-3 flex items-baseline justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/85 backdrop-blur-sm">
          <span className="font-medium">Upcoming</span>
          <span className="font-semibold tabular-nums">{formatCurrency(upcomingOutstandingCents)}</span>
        </div>
      )}

      {showInfo && (
        <div className="mt-3 rounded-lg bg-white/15 px-3 py-2.5 text-xs text-white/90 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <p>
                <strong>Account balance</strong> = your spendable credit minus what&apos;s
                currently owed for delivered or past sessions.
              </p>
              {isSplit && (
                <p>
                  You have <strong>{formatCurrency(availableCreditCents)} credit</strong> on
                  the account and <strong>{formatCurrency(dueOutstandingCents)} due now</strong>{' '}
                  — net <strong>{headlineSign}{formatCurrency(headlineCents)}</strong>.
                </p>
              )}
              <p>
                <strong>Upcoming</strong> is the total still owed on sessions that have been
                booked but haven&apos;t run yet. Sessions you&apos;ve already pre-paid for don&apos;t
                count here — you&apos;ll see them in the charges list with a <em>Paid</em> badge.
              </p>
              <p className="text-white/70">
                A delivered session moves from upcoming into &quot;due now&quot; when it runs;
                a payment shrinks &quot;due now&quot; or builds account credit.
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

      {isSettled && upcomingOutstandingCents === 0 && (
        <p className="mt-2 text-xs text-white/55">No upcoming charges right now.</p>
      )}
    </ImageHero>
  )
}
