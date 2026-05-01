'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, LayoutGrid, Calendar, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Program {
  id: string
  name: string
  type: string
  level: string
  day_of_week: number | null
  start_time: string | null
  end_time: string | null
  per_session_cents: number | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CALENDAR_DAYS = [1, 2, 3, 4, 5, 6] // Mon-Sat

const LEVEL_CONFIG: Record<string, {
  label: string
  ages: string
  description: string
  color: string
  bgLight: string
  border: string
  ballColor: string
  ballHighlight: string
}> = {
  blue: {
    label: 'Blue Ball',
    ages: 'Ages 3–5',
    description: 'First steps on court. Fun games, coordination, and confidence building with soft blue balls.',
    color: 'text-[#4A90D9]',
    bgLight: 'bg-[#4A90D9]/10',
    border: 'border-[#4A90D9]/30',
    ballColor: '#4A90D9',
    ballHighlight: '#6BB0F0',
  },
  red: {
    label: 'Red Ball',
    ages: 'Ages 5–8',
    description: 'Learning the basics. Shorter court, red balls, and building fundamental strokes.',
    color: 'text-[#C53030]',
    bgLight: 'bg-[#C53030]/10',
    border: 'border-[#C53030]/30',
    ballColor: '#C53030',
    ballHighlight: '#E25555',
  },
  orange: {
    label: 'Orange Ball',
    ages: 'Ages 8–10',
    description: 'Developing rallying skills, game play, and match-ready technique on a mid-size court.',
    color: 'text-[#E86A20]',
    bgLight: 'bg-[#E86A20]/10',
    border: 'border-[#E86A20]/30',
    ballColor: '#E86A20',
    ballHighlight: '#F59042',
  },
  green: {
    label: 'Green Ball',
    ages: 'Ages 10–12',
    description: 'Transitioning to full court. Advanced technique, tactics, and competitive play.',
    color: 'text-[#2D8A4E]',
    bgLight: 'bg-[#2D8A4E]/10',
    border: 'border-[#2D8A4E]/30',
    ballColor: '#2D8A4E',
    ballHighlight: '#44B06E',
  },
  yellow: {
    label: 'Yellow Ball',
    ages: 'Ages 12+',
    description: 'Full court, full speed. Competition-ready skills, match strategy, and squad training.',
    color: 'text-[#92730A]',
    bgLight: 'bg-[#EAB308]/10',
    border: 'border-[#EAB308]/30',
    ballColor: '#D4A20A',
    ballHighlight: '#EAB308',
  },
  advanced: {
    label: 'Advanced Squad',
    ages: 'UTR 4.5+',
    description: 'Performance squad for advanced juniors — invitation-based. Trains alongside Yellow and Elite squads on Thursdays.',
    color: 'text-[#2B5EA7]',
    bgLight: 'bg-[#2B5EA7]/10',
    border: 'border-[#2B5EA7]/30',
    ballColor: '#2B5EA7',
    ballHighlight: '#4A7EC7',
  },
  elite: {
    label: 'Elite Squad',
    ages: 'UTR 7.5+',
    description: 'Competition-level training for elite juniors — invitation-based.',
    color: 'text-[#1A2332]',
    bgLight: 'bg-[#1A2332]/10',
    border: 'border-[#1A2332]/30',
    ballColor: '#1A2332',
    ballHighlight: '#3A4352',
  },
}

// Canonical display level — orange-green is not its own level; show under both orange AND green (cards)
// and render with orange styling in the calendar (still one row per program, NAME conveys the dual nature).
function displayLevelForCalendar(level: string): string {
  if (level === 'orange-green') return 'orange'
  return level
}

// Any program name containing "Girls" (case-insensitive) triggers the girls-only pill.
function isGirlsOnly(name: string): boolean {
  return /\bgirls\b/i.test(name)
}

function TennisBall({ color, highlight, size = 64 }: { color: string; highlight: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" fill={color} />
      <circle cx="32" cy="32" r="30" fill="url(#ballShine)" />
      <path d="M12 16C20 28 20 36 12 48" stroke={highlight} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <path d="M52 16C44 28 44 36 52 48" stroke={highlight} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <defs>
        <radialGradient id="ballShine" cx="0.35" cy="0.3" r="0.65">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

function GirlsPill() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E87AA8]/15 px-2 py-0.5 text-[10px] font-semibold text-[#C04F82]">
      <Sparkles className="size-2.5" />
      Girls only
    </span>
  )
}

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function formatPrice(cents: number | null) {
  if (!cents) return null
  return `$${(cents / 100).toFixed(0)}`
}

export function ProgramsSection({ programs }: { programs: Program[] }) {
  const [view, setView] = useState<'cards' | 'calendar'>('cards')
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null)

  // Cards view: bucket by level. orange-green programs appear in BOTH orange and green buckets.
  const byLevel = new Map<string, Program[]>()
  for (const p of programs) {
    const buckets = p.level === 'orange-green' ? ['orange', 'green'] : [p.level]
    for (const bucket of buckets) {
      const list = byLevel.get(bucket) ?? []
      list.push(p)
      byLevel.set(bucket, list)
    }
  }

  // Known level order: blue, red, orange, green, yellow, advanced, elite. Everything else sorts to end.
  const levelOrder = ['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite']
  const sortedLevels = [...byLevel.entries()]
    // Only render buckets that have a LEVEL_CONFIG entry — unknowns (e.g. "competitive") skip the card view.
    .filter(([level]) => LEVEL_CONFIG[level])
    .sort((a, b) => {
      const ai = levelOrder.indexOf(a[0])
      const bi = levelOrder.indexOf(b[0])
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

  return (
    <section id="programs" className="scroll-mt-20 bg-[#FFFBF7] px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1A2332] sm:text-3xl">Our Programs</h2>
          <p className="mt-3 text-[#556270]">
            Group coaching programs running at Somerton Park Tennis Club
          </p>
        </div>

        {/* View toggle */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-[#E0D0BE]/60 bg-white p-1 shadow-sm">
            <button
              onClick={() => setView('cards')}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                view === 'cards'
                  ? 'bg-[#2B5EA7] text-white shadow-sm'
                  : 'text-[#556270] hover:text-[#1A2332]'
              }`}
            >
              <LayoutGrid className="size-4" />
              By Level
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                view === 'calendar'
                  ? 'bg-[#2B5EA7] text-white shadow-sm'
                  : 'text-[#556270] hover:text-[#1A2332]'
              }`}
            >
              <Calendar className="size-4" />
              Weekly View
            </button>
          </div>
        </div>

        {/* Card view */}
        {view === 'cards' && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {sortedLevels.map(([level, progs]) => {
              const config = LEVEL_CONFIG[level]
              const isExpanded = expandedLevel === level
              const minPrice = Math.min(...progs.map((p) => p.per_session_cents ?? Infinity))
              const sessionCount = progs.length

              return (
                <div
                  key={level}
                  className={`group overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${config.border}`}
                >
                  {/* Card header with ball icon */}
                  <button
                    onClick={() => setExpandedLevel(isExpanded ? null : level)}
                    className="flex w-full items-start gap-4 p-4 text-left"
                  >
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-lg sm:size-20">
                      <TennisBall color={config.ballColor} highlight={config.ballHighlight} size={56} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-lg font-semibold ${config.color}`}>{config.label}</h3>
                        {config.ages && (
                          <span className="text-xs text-[#8899A6]">{config.ages}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm leading-relaxed text-[#556270] line-clamp-2">
                        {config.description}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-[#8899A6]">
                        <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}/week</span>
                        {minPrice < Infinity && (
                          <span>From {formatPrice(minPrice)}/session</span>
                        )}
                      </div>
                    </div>
                    <ChevronDown
                      className={`mt-1 size-5 shrink-0 text-[#8899A6] transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Expanded schedule */}
                  {isExpanded && (
                    <div className={`border-t ${config.border} ${config.bgLight} px-4 py-3`}>
                      <div className="space-y-2">
                        {progs.map((p) => (
                          <div
                            key={`${level}-${p.id}`}
                            className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 shadow-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="text-sm font-medium text-[#1A2332]">
                                  {DAYS[p.day_of_week ?? 0]}{' '}
                                  {p.start_time && formatTime(p.start_time)}
                                  {p.end_time && ` – ${formatTime(p.end_time)}`}
                                </p>
                                {isGirlsOnly(p.name) && <GirlsPill />}
                              </div>
                              <p className="mt-0.5 text-xs text-[#8899A6]">
                                {p.type === 'squad' ? 'Squad' : 'Group'}
                                {p.per_session_cents ? ` · ${formatPrice(p.per_session_cents)}/session` : ''}
                                {p.level === 'orange-green' ? ' · Orange/Green bridging' : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Private lessons card */}
            <div className="group overflow-hidden rounded-xl border border-[#E0D0BE]/40 bg-white shadow-sm transition-all hover:shadow-md sm:col-span-2">
              <div className="flex items-start gap-4 p-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#2B5EA7] to-[#1A4A8A] sm:size-20">
                  {/* Blue court visual */}
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="56" height="56" rx="4" fill="#2B5EA7" />
                    <rect x="8" y="8" width="40" height="40" rx="2" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
                    <line x1="28" y1="8" x2="28" y2="48" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
                    <line x1="8" y1="28" x2="48" y2="28" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
                    <circle cx="28" cy="28" r="6" stroke="white" strokeWidth="1.5" strokeOpacity="0.3" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-[#2B5EA7]">Private Lessons</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-[#556270]">
                    1-on-1 coaching tailored to your child&apos;s specific needs. Perfect for focused skill development or match preparation.
                  </p>
                  <div className="mt-2">
                    <a href="#trial" className="inline-flex items-center text-sm font-medium text-[#E87450] hover:underline">
                      Enquire via trial form <ChevronRight className="ml-0.5 size-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calendar view */}
        {view === 'calendar' && (
          <div className="mt-8">
            {/* Desktop calendar (hidden on mobile) */}
            <div className="hidden overflow-hidden rounded-xl border border-[#E0D0BE]/40 bg-white shadow-sm sm:block">
              <div className="grid grid-cols-6 border-b border-[#E0D0BE]/30">
                {CALENDAR_DAYS.map((d) => (
                  <div key={d} className="border-r border-[#E0D0BE]/20 px-3 py-2.5 text-center text-xs font-semibold tracking-wide text-[#556270] uppercase last:border-r-0">
                    {DAYS[d]}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-6 divide-x divide-[#E0D0BE]/20">
                {CALENDAR_DAYS.map((d) => {
                  const dayProgs = programs
                    .filter((p) => p.day_of_week === d)
                    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

                  return (
                    <div key={d} className="min-h-[200px] space-y-1.5 p-2">
                      {dayProgs.map((p) => {
                        const displayLevel = displayLevelForCalendar(p.level)
                        const config = LEVEL_CONFIG[displayLevel]
                        if (!config) return null
                        const label = p.level === 'orange-green' ? 'Orange/Green' : config.label
                        return (
                          <a
                            key={p.id}
                            href="#trial"
                            className={`block rounded-lg p-2 text-left transition-all hover:scale-[1.02] hover:shadow-sm ${config.bgLight} border ${config.border}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <p className={`text-xs font-semibold ${config.color}`}>{label}</p>
                              {isGirlsOnly(p.name) && <GirlsPill />}
                            </div>
                            <p className="mt-0.5 text-[10px] text-[#556270]">
                              {p.start_time && formatTime(p.start_time)}
                              {p.end_time && ` – ${formatTime(p.end_time)}`}
                            </p>
                            {p.per_session_cents && (
                              <p className="mt-0.5 text-[10px] text-[#8899A6]">
                                {formatPrice(p.per_session_cents)}/session
                              </p>
                            )}
                          </a>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Mobile calendar (stacked by day) */}
            <div className="space-y-4 sm:hidden">
              {CALENDAR_DAYS.map((d) => {
                const dayProgs = programs
                  .filter((p) => p.day_of_week === d)
                  .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

                if (dayProgs.length === 0) return null

                return (
                  <div key={d}>
                    <h3 className="mb-2 text-sm font-semibold text-[#1A2332]">{DAYS[d]}day</h3>
                    <div className="space-y-2">
                      {dayProgs.map((p) => {
                        const displayLevel = displayLevelForCalendar(p.level)
                        const config = LEVEL_CONFIG[displayLevel]
                        if (!config) return null
                        const label = p.level === 'orange-green' ? 'Orange/Green' : config.label
                        return (
                          <a
                            key={p.id}
                            href="#trial"
                            className={`flex items-center justify-between rounded-lg p-3 ${config.bgLight} border ${config.border}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={`text-sm font-semibold ${config.color}`}>{label}</p>
                                {isGirlsOnly(p.name) && <GirlsPill />}
                              </div>
                              <p className="text-xs text-[#556270]">
                                {p.start_time && formatTime(p.start_time)}
                                {p.end_time && ` – ${formatTime(p.end_time)}`}
                                {p.per_session_cents ? ` · ${formatPrice(p.per_session_cents)}/session` : ''}
                              </p>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-[#8899A6]" />
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-10 text-center">
          <p className="text-[#556270]">
            Not sure which level? Book a free trial and we&apos;ll help you find the right fit.
          </p>
          <Button asChild size="lg" className="mt-4 rounded-full bg-[#2B5EA7] px-8 text-white hover:bg-[#1E4A88]">
            <a href="#trial">
              Book a Free Trial
              <ChevronRight className="ml-1 size-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
