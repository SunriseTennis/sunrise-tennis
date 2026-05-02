'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { ImageHero } from '@/components/image-hero'
import { CreditCard, Info, X } from 'lucide-react'

export function BalanceHero({
  confirmedBalanceCents,
}: {
  confirmedBalanceCents: number
}) {
  const [showInfo, setShowInfo] = useState(false)

  // Current balance = outstanding for completed sessions (negative confirmed balance).
  // Credit balances (positive) display as-is.
  const balanceCents = confirmedBalanceCents

  return (
    <ImageHero>
      <div className="flex items-center gap-2">
        <CreditCard className="size-5 text-white/80" />
        <p className="text-sm font-medium text-white/80">
          {balanceCents < 0 ? 'Current balance' : balanceCents > 0 ? 'Credit on account' : 'All paid up'}
        </p>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="rounded-full p-0.5 text-white/50 transition-colors hover:text-white/80"
          aria-label="Balance explanation"
        >
          <Info className="size-3.5" />
        </button>
      </div>

      <p className={`mt-2 text-3xl font-bold tabular-nums ${
        balanceCents < 0 ? 'text-red-200' :
        balanceCents > 0 ? 'text-emerald-200' :
        'text-white'
      }`}>
        {formatCurrency(balanceCents)}
      </p>
      <p className="mt-0.5 text-xs text-white/60">
        {balanceCents < 0 ? 'Completed sessions awaiting payment' : 'Future sessions are listed below as Scheduled'}
      </p>

      {showInfo && (
        <div className="mt-3 rounded-lg bg-white/15 px-3 py-2.5 text-xs text-white/90 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <p>
                <strong>Current balance</strong> is what you owe for sessions that have already been delivered. Credits from cancellations are included.
              </p>
              <p>
                Scheduled future sessions appear in the list below with a <em>Scheduled</em> badge &mdash; they won&apos;t add to your balance until the session runs.
              </p>
              <p className="text-white/70">
                Positive number = credit on your account. Negative = amount owing.
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
