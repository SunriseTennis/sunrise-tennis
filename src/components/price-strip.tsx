import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const ROWS = [
  {
    label: 'Red / Orange Ball',
    meta: '45-60 min group session',
    amount: 20,
    amountSuffix: '–25',
    ballColors: ['#C53030', '#E86A20'],
  },
  {
    label: 'Green / Yellow Ball',
    meta: '60 min group session',
    amount: 25,
    ballColors: ['#2D8A4E', '#D4A20A'],
  },
  {
    label: 'Performance squads (Thu)',
    meta: '60-90 min — Red/Orange $25, Green/Yellow/Adv/Elite $30',
    amount: 25,
    amountSuffix: '–30',
    ballColors: ['#8B5A2B', '#1A2332'],
  },
  {
    label: 'Morning squads (Tue/Wed)',
    meta: '6:45-8am — Advanced/Elite. $15 if both days',
    amount: 25,
    ballColors: ['#8B5A2B'],
  },
  {
    label: 'Schools program',
    meta: '45 min group session',
    amount: 20,
    ballColors: ['#2B5EA7', '#C53030'],
  },
]

export function PriceStrip() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-gradient-to-b from-[#FFFBF7] to-[#FFF6ED] px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:mb-8">
          <h2 className="text-2xl font-bold text-[#1A2332] sm:text-3xl">Pricing</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-[#556270]">
            All prices visible up front. Per player, per session (AUD, incl. GST).
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E0D0BE]/40 bg-white shadow-sm">
          {/* Rows */}
          <ul className="divide-y divide-[#E0D0BE]/30">
            {ROWS.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5">
                <div className="flex min-w-0 items-center gap-3">
                  {/* Ball-color dots */}
                  <div className="flex shrink-0 items-center -space-x-1.5">
                    {row.ballColors.map((c, i) => (
                      <span
                        key={i}
                        className="size-4 rounded-full border-2 border-white shadow-sm sm:size-5"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1A2332] sm:text-base">{row.label}</p>
                    <p className="truncate text-xs text-[#556270]">{row.meta}</p>
                  </div>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums text-[#1A2332] sm:text-xl">
                  ${row.amount}{(row as { amountSuffix?: string }).amountSuffix ?? ''}
                  <span className="text-xs font-normal text-[#8899A6] sm:text-sm">/session</span>
                </p>
              </li>
            ))}
          </ul>

          {/* Footer note */}
          <div className="border-t border-[#E0D0BE]/30 bg-[#FFFBF7] px-5 py-3.5 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#556270]">
                <span className="font-medium text-[#1A2332]">25% off the cheaper group, per child</span> ·
                <span className="ml-1 font-medium text-[#1A2332]">15% early-bird</span> until Mon 4 May ·
                <span className="ml-1 font-medium text-[#1A2332]">10%</span> until Sun 10 May
              </p>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#2B5EA7] hover:underline sm:text-sm"
              >
                Sign in for your family&apos;s pricing
                <ChevronRight className="ml-0.5 size-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-[#8899A6]">
          Private coaching and squad programs — see full rates in-app after signup.
        </p>
      </div>
    </section>
  )
}
