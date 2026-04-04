'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { CreditCard } from 'lucide-react'

export function BalanceHero({
  confirmedBalanceCents,
  projectedBalanceCents,
}: {
  confirmedBalanceCents: number
  projectedBalanceCents: number
}) {
  const [view, setView] = useState<'upcoming' | 'current'>('upcoming')

  const balanceCents = view === 'upcoming' ? projectedBalanceCents : confirmedBalanceCents
  const label = view === 'upcoming' ? 'Upcoming Balance' : 'Current Balance'
  const subtitle = view === 'upcoming'
    ? 'Includes future bookings'
    : 'Completed sessions only'

  return (
    <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="size-5 text-white/80" />
            <p className="text-sm font-medium text-white/80">{label}</p>
          </div>

          {/* Toggle pills */}
          <div className="flex rounded-full bg-white/15 p-0.5 backdrop-blur-sm">
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
          </div>
        </div>

        <p className={`mt-2 text-3xl font-bold tabular-nums ${
          balanceCents < 0 ? 'text-red-200' :
          balanceCents > 0 ? 'text-emerald-200' :
          'text-white'
        }`}>
          {formatCurrency(balanceCents)}
        </p>
        <p className="mt-0.5 text-xs text-white/60">
          {balanceCents < 0 ? 'Outstanding balance' : balanceCents > 0 ? 'Credit on account' : 'Account balance'}
          {' - '}
          {subtitle}
        </p>
      </div>
    </div>
  )
}
