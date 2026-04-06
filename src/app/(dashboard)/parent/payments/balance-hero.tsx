'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { ImageHero } from '@/components/image-hero'
import { CreditCard, Info, X } from 'lucide-react'

export function BalanceHero({
  confirmedBalanceCents,
  projectedBalanceCents,
}: {
  confirmedBalanceCents: number
  projectedBalanceCents: number
}) {
  const [view, setView] = useState<'current' | 'upcoming'>('current')
  const [showInfo, setShowInfo] = useState(false)

  const balanceCents = view === 'upcoming' ? projectedBalanceCents : confirmedBalanceCents
  const label = view === 'upcoming' ? 'Upcoming Balance' : 'Current Balance'
  const subtitle = view === 'upcoming'
    ? 'Includes future bookings'
    : 'Completed sessions only'

  return (
    <ImageHero src="/images/tennis/hero-sunset.jpg" alt="Tennis court">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="size-5 text-white/80" />
          <p className="text-sm font-medium text-white/80">{label}</p>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="rounded-full p-0.5 text-white/50 transition-colors hover:text-white/80"
            aria-label="Balance explanation"
          >
            <Info className="size-3.5" />
          </button>
        </div>

        {/* Toggle pills */}
        <div className="flex rounded-full bg-white/15 p-0.5 backdrop-blur-sm">
          <button
            onClick={() => setView('current')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              view === 'current'
                ? 'bg-white/25 text-white shadow-sm'
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            Current
          </button>
          <button
            onClick={() => setView('upcoming')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              view === 'upcoming'
                ? 'bg-white/25 text-white shadow-sm'
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            Upcoming
          </button>
        </div>
      </div>

      <p className={`mt-2 text-3xl font-bold tabular-nums ${
        balanceCents < 0 ? 'text-red-200' :
        balanceCents > 0 ? 'text-emerald-200' :
        'text-white'
      }`}>
        {formatCurrency(balanceCents)}
      </p>
      <p className="mt-0.5 text-xs text-white/60">{subtitle}</p>

      {/* Info tooltip */}
      {showInfo && (
        <div className="mt-3 rounded-lg bg-white/15 px-3 py-2.5 text-xs text-white/90 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <p>
                <strong>Current Balance</strong> reflects completed sessions only - what you owe right now.
              </p>
              <p>
                <strong>Upcoming Balance</strong> includes all scheduled future sessions, so you can see the full picture.
              </p>
              <p className="text-white/70">
                Positive balance = credit on your account. Negative = amount owing.
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
