'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Sparkles, ChevronRight } from 'lucide-react'
import { formatTime } from '@/lib/utils/dates'

export interface UpcomingMoment {
  playerName: string
  startAt: string          // ISO datetime string
  programName: string
  href: string             // where to tap through
}

/**
 * Coaching-moment strip. Shows one line:
 *   - Within 4hr: "<Player> has a session at <time> — tap to see what they're working on"
 *   - Else today: "<Player> has a session at <time>"
 *   - Else: renders nothing
 * No payment CTAs, by design.
 */
export function CoachingMomentStrip({ moments }: { moments: UpcomingMoment[] }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(t)
  }, [])

  if (!now) return null

  const todayStr = now.toISOString().split('T')[0]

  // Select most-urgent moment: earliest startAt that is still in the future AND today.
  const upcomingToday = moments
    .map(m => ({ ...m, date: new Date(m.startAt) }))
    .filter(m => !isNaN(m.date.getTime()) && m.date.getTime() > now.getTime() && m.startAt.slice(0, 10) === todayStr)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const next = upcomingToday[0]
  if (!next) return null

  const msUntil = next.date.getTime() - now.getTime()
  const within4hr = msUntil <= 4 * 60 * 60 * 1000

  const time = formatTime(next.date.toTimeString().slice(0, 5))
  const label = within4hr
    ? `${next.playerName} has a session at ${time} — tap to see what they're working on`
    : `${next.playerName} has a session at ${time}`

  return (
    <Link
      href={next.href}
      className="animate-fade-up flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-amber-50 px-4 py-3 text-sm shadow-card transition-all hover:shadow-elevated press-scale"
      style={{ animationDelay: '70ms' }}
    >
      <Sparkles className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 font-medium text-deep-navy line-clamp-2">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-primary/60" />
    </Link>
  )
}
