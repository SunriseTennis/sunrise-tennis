'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, LayoutGrid, Calendar, Sparkles, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isPerformanceOnly } from '@/lib/utils/eligibility'

interface Program {
  id: string
  name: string
  type: string
  level: string
  day_of_week: number | null
  start_time: string | null
  end_time: string | null
  per_session_cents: number | null
  track_required?: string | null
  allowed_classifications?: string[] | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const CALENDAR_DAYS = [1, 2, 3, 4, 5, 6] // Mon-Sat

const SCHOOL_BUCKET = 'school'

const CLASSIFICATION_COLORS: Record<string, string> = {
  blue: '#4A90D9',
  red: '#C53030',
  orange: '#E86A20',
  green: '#2D8A4E',
  yellow: '#D4A20A',
  advanced: '#8B5A2B',
  elite: '#1A2332',
}

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
  [SCHOOL_BUCKET]: {
    label: 'Afterschool Programs',
    ages: 'School-based, ages 5-12',
    description: 'On-site coaching at partner primary schools. Term-fee billing, parents collect after the session.',
    color: 'text-[#2B5EA7]',
    bgLight: 'bg-[#2B5EA7]/8',
    border: 'border-[#2B5EA7]/25',
    ballColor: '#2B5EA7',
    ballHighlight: '#C53030', // red accent — overridden by dynamic dual ball
  },
  blue: {
    label: 'Blue Ball',
    ages: 'Ages 3-5',
    description: 'First steps on court. Fun games, coordination, and confidence building with soft blue balls.',
    color: 'text-[#4A90D9]',
    bgLight: 'bg-[#4A90D9]/10',
    border: 'border-[#4A90D9]/30',
    ballColor: '#4A90D9',
    ballHighlight: '#6BB0F0',
  },
  red: {
    label: 'Red Ball',
    ages: 'Ages 5-8',
    description: 'Learning the basics. Shorter court, red balls, and building fundamental strokes.',
    color: 'text-[#C53030]',
    bgLight: 'bg-[#C53030]/10',
    border: 'border-[#C53030]/30',
    ballColor: '#C53030',
    ballHighlight: '#E25555',
  },
  orange: {
    label: 'Orange Ball',
    ages: 'Ages 8-10',
    description: 'Developing rallying skills, game play, and match-ready technique on a mid-size court.',
    color: 'text-[#E86A20]',
    bgLight: 'bg-[#E86A20]/10',
    border: 'border-[#E86A20]/30',
    ballColor: '#E86A20',
    ballHighlight: '#F59042',
  },
  green: {
    label: 'Green Ball',
    ages: 'Ages 10-12',
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
    color: 'text-[#8B5A2B]',
    bgLight: 'bg-[#8B5A2B]/10',
    border: 'border-[#8B5A2B]/30',
    ballColor: '#8B5A2B',
    ballHighlight: '#B07840',
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
function displayLevelForCalendar(level: string, type?: string | null): string {
  if (type === 'school') return SCHOOL_BUCKET
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

// Two-half-circle ball used by multi-classification cards (currently the
// schools card). Falls back to the regular ball when fewer than two colours.
function MultiBall({ colors, size = 56 }: { colors: string[]; size?: number }) {
  if (colors.length < 2) {
    return <TennisBall color={colors[0] ?? '#2B5EA7'} highlight="#FFFFFF" size={size} />
  }
  const [left, right] = colors
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="leftHalf"><rect x="0" y="0" width="32" height="64" /></clipPath>
        <clipPath id="rightHalf"><rect x="32" y="0" width="32" height="64" /></clipPath>
        <radialGradient id="multiBallShine" cx="0.35" cy="0.3" r="0.65">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={left} clipPath="url(#leftHalf)" />
      <circle cx="32" cy="32" r="30" fill={right} clipPath="url(#rightHalf)" />
      <circle cx="32" cy="32" r="30" fill="url(#multiBallShine)" />
      <path d="M32 2 L32 62" stroke="white" strokeWidth="1.5" opacity="0.45" />
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

function PerformancePill() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#2B5EA7]/12 px-2 py-0.5 text-[10px] font-semibold text-[#2B5EA7]">
      <Trophy className="size-2.5" />
      Performance only
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
  // Mobile-only weekly accordion state. Initialise to the next non-empty
  // calendar day from today so the surface isn't fully collapsed on first paint.
  const initialMobileDay = useMemo(() => {
    const today = new Date().getDay()
    const order = [...CALENDAR_DAYS]
    const rotated = [...order.slice(order.indexOf(today)), ...order.slice(0, order.indexOf(today))]
      .filter(d => d !== -1) as number[]
    const first = rotated.find(d => programs.some(p => p.day_of_week === d))
    return first ?? CALENDAR_DAYS.find(d => programs.some(p => p.day_of_week === d)) ?? null
  }, [programs])
  const [expandedMobileDay, setExpandedMobileDay] = useState<number | null>(initialMobileDay)

  // Cards view: bucket by level. orange-green programs appear in BOTH orange and green buckets.
  // Schools (type='school') get their own bucket regardless of `level`.
  const byLevel = new Map<string, Program[]>()
  for (const p of programs) {
    const buckets = p.type === 'school'
      ? [SCHOOL_BUCKET]
      : (p.level === 'orange-green' ? ['orange', 'green'] : [p.level])
    for (const bucket of buckets) {
      const list = byLevel.get(bucket) ?? []
      list.push(p)
      byLevel.set(bucket, list)
    }
  }

  // Schools first, then standard ball-level pathway, then performance squads.
  const levelOrder = [SCHOOL_BUCKET, 'blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite']
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
            Group coaching at Somerton Park Tennis Club
          </p>
          <div className="mx-auto mt-4 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-[#E0D0BE]/60 bg-white px-4 py-1.5 text-xs font-medium text-[#556270] shadow-sm sm:text-sm">
            <span className="font-semibold text-[#2B5EA7]">Term 2 2026</span>
            <span className="text-[#8899A6]">·</span>
            <span>Mon 4 May – Fri 3 Jul</span>
            <span className="text-[#8899A6]">·</span>
            <span>9 weeks</span>
          </div>
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
              const allPerformance = progs.every(p => isPerformanceOnly({
                day_of_week: p.day_of_week,
                allowed_classifications: p.allowed_classifications,
                track_required: p.track_required,
                gender_restriction: null,
              }))
              // For the schools card header, derive dot palette from the union
              // of allowed_classifications across all schools programs.
              const isSchoolBucket = level === SCHOOL_BUCKET
              const schoolDotColors = isSchoolBucket
                ? (() => {
                    const all = new Set<string>()
                    for (const p of progs) (p.allowed_classifications ?? []).forEach(c => all.add(c))
                    if (all.size === 0) return ['#2B5EA7', '#C53030']
                    return Array.from(all)
                      .map(c => CLASSIFICATION_COLORS[c])
                      .filter((c): c is string => Boolean(c))
                  })()
                : []

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
                      {isSchoolBucket
                        ? <MultiBall colors={schoolDotColors} size={56} />
                        : <TennisBall color={config.ballColor} highlight={config.ballHighlight} size={56} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-lg font-semibold ${config.color}`}>{config.label}</h3>
                        {config.ages && (
                          <span className="text-xs text-[#8899A6]">{config.ages}</span>
                        )}
                        {allPerformance && <PerformancePill />}
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
                        {progs.map((p) => {
                          const performance = isPerformanceOnly({
                            day_of_week: p.day_of_week,
                            allowed_classifications: p.allowed_classifications,
                            track_required: p.track_required,
                            gender_restriction: null,
                          })
                          return (
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
                                  {performance && !allPerformance && <PerformancePill />}
                                </div>
                                <p className="mt-0.5 text-xs text-[#8899A6]">
                                  {p.type === 'school' ? p.name : (p.type === 'squad' ? 'Squad' : 'Group')}
                                  {p.per_session_cents ? ` · ${formatPrice(p.per_session_cents)}/session` : ''}
                                  {p.level === 'orange-green' ? ' · Orange/Green bridging' : ''}
                                </p>
                              </div>
                            </div>
                          )
                        })}
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
                        const displayLevel = displayLevelForCalendar(p.level, p.type)
                        const config = LEVEL_CONFIG[displayLevel]
                        if (!config) return null
                        const label = p.type === 'school'
                          ? p.name
                          : (p.level === 'orange-green' ? 'Orange/Green' : config.label)
                        const performance = isPerformanceOnly({
                          day_of_week: p.day_of_week,
                          allowed_classifications: p.allowed_classifications,
                          track_required: p.track_required,
                          gender_restriction: null,
                        })
                        return (
                          <a
                            key={p.id}
                            href="#trial"
                            className={`block rounded-lg p-2 text-left transition-all hover:scale-[1.02] hover:shadow-sm ${config.bgLight} border ${config.border}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-1">
                              <p className={`text-xs font-semibold leading-tight ${config.color}`}>{label}</p>
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
                            {performance && (
                              <div className="mt-1"><PerformancePill /></div>
                            )}
                          </a>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Mobile calendar — accordion (one day open at a time) */}
            <div className="space-y-2 sm:hidden">
              {CALENDAR_DAYS.map((d) => {
                const dayProgs = programs
                  .filter((p) => p.day_of_week === d)
                  .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

                if (dayProgs.length === 0) return null
                const isOpen = expandedMobileDay === d

                return (
                  <div key={d} className="overflow-hidden rounded-xl border border-[#E0D0BE]/40 bg-white shadow-sm">
                    <button
                      onClick={() => setExpandedMobileDay(isOpen ? null : d)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#1A2332]">{FULL_DAYS[d]}</span>
                        <span className="rounded-full bg-[#FFF6ED] px-2 py-0.5 text-[10px] font-medium text-[#8899A6]">
                          {dayProgs.length}
                        </span>
                      </span>
                      <ChevronDown
                        className={`size-4 text-[#8899A6] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="space-y-2 border-t border-[#E0D0BE]/30 bg-[#FFFBF7] px-3 py-3">
                        {dayProgs.map((p) => {
                          const displayLevel = displayLevelForCalendar(p.level, p.type)
                          const config = LEVEL_CONFIG[displayLevel]
                          if (!config) return null
                          const label = p.type === 'school'
                            ? p.name
                            : (p.level === 'orange-green' ? 'Orange/Green' : config.label)
                          const performance = isPerformanceOnly({
                            day_of_week: p.day_of_week,
                            allowed_classifications: p.allowed_classifications,
                            track_required: p.track_required,
                            gender_restriction: null,
                          })
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
                                  {performance && <PerformancePill />}
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
                    )}
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
