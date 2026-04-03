'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { Badge } from '@/components/ui/badge'
import { WeeklyCalendar, type CalendarEvent, type EnrolledPlayersMap } from '@/components/weekly-calendar'
import { Calendar, List, Layers, Tag, ChevronRight, Users, Filter } from 'lucide-react'
import { bookSession, markSessionAway } from './actions'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DAY_PREFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const LEVEL_ACCENTS: Record<string, { bar: string; bg: string; badge: string }> = {
  red:    { bar: 'bg-ball-red',    bg: 'bg-ball-red/5',    badge: 'bg-ball-red/10 text-ball-red border-ball-red/20' },
  orange: { bar: 'bg-ball-orange', bg: 'bg-ball-orange/5', badge: 'bg-ball-orange/10 text-ball-orange border-ball-orange/20' },
  green:  { bar: 'bg-ball-green',  bg: 'bg-ball-green/5',  badge: 'bg-ball-green/10 text-ball-green border-ball-green/20' },
  yellow: { bar: 'bg-ball-yellow', bg: 'bg-ball-yellow/5', badge: 'bg-ball-yellow/10 text-ball-yellow border-ball-yellow/20' },
  blue:   { bar: 'bg-ball-blue',   bg: 'bg-ball-blue/5',   badge: 'bg-ball-blue/10 text-ball-blue border-ball-blue/20' },
}

const LEVEL_COLORS: Record<string, string> = {
  red: 'bg-ball-red/20 border-ball-red/30',
  orange: 'bg-ball-orange/20 border-ball-orange/30',
  green: 'bg-ball-green/20 border-ball-green/30',
  yellow: 'bg-ball-yellow/20 border-ball-yellow/30',
  competitive: 'bg-primary/15 border-primary/30',
}

/** Calendar event colors — solid for enrolled, lighter for not */
const LEVEL_CAL_COLORS: Record<string, { enrolled: string; available: string }> = {
  red:    { enrolled: 'bg-ball-red border-ball-red/80 text-white',       available: 'bg-ball-red/20 border-ball-red/40 text-ball-red' },
  orange: { enrolled: 'bg-ball-orange border-ball-orange/80 text-white', available: 'bg-ball-orange/20 border-ball-orange/40 text-ball-orange' },
  green:  { enrolled: 'bg-ball-green border-ball-green/80 text-white',   available: 'bg-ball-green/20 border-ball-green/40 text-ball-green' },
  yellow: { enrolled: 'bg-ball-yellow border-ball-yellow/80 text-black', available: 'bg-ball-yellow/20 border-ball-yellow/40 text-ball-yellow' },
  blue:   { enrolled: 'bg-ball-blue border-ball-blue/80 text-white',     available: 'bg-ball-blue/20 border-ball-blue/40 text-ball-blue' },
}

const DEFAULT_CAL_COLORS = {
  enrolled: 'bg-primary border-primary/80 text-white',
  available: 'bg-primary/15 border-primary/30 text-primary',
}

/** Button colors for level filter pills */
const LEVEL_PILL_STYLES: Record<string, { active: string; inactive: string }> = {
  red:    { active: 'bg-ball-red text-white shadow-sm',    inactive: 'bg-ball-red/15 text-ball-red hover:bg-ball-red/25' },
  orange: { active: 'bg-ball-orange text-white shadow-sm', inactive: 'bg-ball-orange/15 text-ball-orange hover:bg-ball-orange/25' },
  green:  { active: 'bg-ball-green text-white shadow-sm',  inactive: 'bg-ball-green/15 text-ball-green hover:bg-ball-green/25' },
  yellow: { active: 'bg-ball-yellow text-black shadow-sm', inactive: 'bg-ball-yellow/15 text-ball-yellow hover:bg-ball-yellow/25' },
  blue:   { active: 'bg-ball-blue text-white shadow-sm',   inactive: 'bg-ball-blue/15 text-ball-blue hover:bg-ball-blue/25' },
  competitive: { active: 'bg-primary text-white shadow-sm', inactive: 'bg-primary/15 text-primary hover:bg-primary/25' },
}

const TYPE_PILL_STYLES: Record<string, { active: string; inactive: string }> = {
  group:       { active: 'bg-blue-600 text-white shadow-sm',  inactive: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  squad:       { active: 'bg-slate-700 text-white shadow-sm', inactive: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
  school:      { active: 'bg-purple-600 text-white shadow-sm', inactive: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  competition: { active: 'bg-amber-500 text-white shadow-sm', inactive: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
}

type Program = {
  id: string
  name: string
  type: string
  level: string | null
  day_of_week: number | null
  start_time: string | null
  end_time: string | null
  max_capacity: number | null
  per_session_cents: number | null
  term_fee_cents: number | null
  early_pay_discount_pct: number | null
  early_bird_deadline: string | null
  description: string | null
  program_roster: { id: string; player_id: string; status: string }[]
}

type Session = {
  id: string
  program_id: string
  date: string
  start_time: string | null
  end_time: string | null
  status: string
}

type Tab = 'calendar' | 'list' | 'level' | 'type'

/** Strip day prefix from program name for calendar display, clean up "Ball" and avoid double suffix */
function formatCalendarTitle(name: string, type: string): string {
  let result = name
  const lower = result.toLowerCase()

  // Strip day prefix (e.g. "Mon ", "Wed ")
  for (const prefix of DAY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      result = result.slice(prefix.length + 1)
      break
    }
  }

  // Remove "Ball" (e.g. "Orange Ball" → "Orange")
  result = result.replace(/\s+Ball\b/gi, '')

  // Add type suffix if not already present
  const resultLower = result.toLowerCase()
  if (type === 'group' && !resultLower.includes('group')) {
    result = result + ' Group'
  } else if (type === 'squad' && !resultLower.includes('squad')) {
    result = result + ' Squad'
  }

  return result
}

function ProgramCard({
  program,
  familyPlayerIds,
  index,
}: {
  program: Program
  familyPlayerIds: Set<string>
  index: number
}) {
  const roster = program.program_roster ?? []
  const enrolled = roster.filter((r) => r.status === 'enrolled')
  const familyEnrolled = enrolled.filter((r) => familyPlayerIds.has(r.player_id))
  const spotsLeft = program.max_capacity ? program.max_capacity - enrolled.length : null
  const accent = LEVEL_ACCENTS[program.level ?? ''] ?? { bar: 'bg-primary', bg: 'bg-primary/5', badge: 'bg-primary/10 text-primary border-primary/20' }

  return (
    <Link
      href={`/parent/programs/${program.id}`}
      className={`group relative block overflow-hidden rounded-xl border border-border ${accent.bg} p-5 shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] animate-fade-up`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Level color accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 ${accent.bar}`} />

      <div className="pl-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{program.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {program.day_of_week != null && DAYS[program.day_of_week]}
              {program.start_time && ` · ${formatTime(program.start_time)}`}
              {program.end_time && ` – ${formatTime(program.end_time)}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 ml-3">
            <Badge variant="outline" className={`capitalize font-medium ${accent.badge}`}>{program.type}</Badge>
            {program.level && (
              <span className="text-xs capitalize text-muted-foreground">{program.level}</span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="flex gap-3 text-muted-foreground">
            {program.per_session_cents && <span className="font-medium">{formatCurrency(program.per_session_cents)}/session</span>}
            {program.term_fee_cents && <span className="font-medium">{formatCurrency(program.term_fee_cents)}/term</span>}
          </div>
          <div className="flex items-center gap-2">
            {spotsLeft !== null && (
              <span className={`flex items-center gap-1 ${spotsLeft <= 2 ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
                <Users className="size-3" />
                {spotsLeft > 0 ? `${spotsLeft} left` : 'Full'}
              </span>
            )}
            {familyEnrolled.length > 0 && (
              <Badge variant="outline" className="bg-success-light text-success border-success/20 font-medium">Enrolled</Badge>
            )}
          </div>
        </div>
      </div>

      <ChevronRight className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

/**
 * Filter programs by level, including competition programs that span
 * multiple levels (e.g. "Red/Orange comp" shows under both red and orange).
 */
function filterByLevel(programs: Program[], level: string): Program[] {
  return programs.filter(p => {
    if (p.level === level) return true
    const nameLower = p.name.toLowerCase()
    return nameLower.includes(level.toLowerCase())
  })
}

export function ParentProgramFilters({
  programs,
  sessions,
  playerLevels,
  familyPlayerIds,
  familyPlayers,
}: {
  programs: Program[]
  sessions: Session[]
  playerLevels: string[]
  familyPlayerIds: string[]
  familyPlayers: { id: string; name: string }[]
}) {
  const [tab, setTab] = useState<Tab>('calendar')
  const [levelFilter, setLevelFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [calendarFilter, setCalendarFilter] = useState<'all' | 'mine'>('mine')
  const playerIds = useMemo(() => new Set(familyPlayerIds), [familyPlayerIds])
  const playerLevelSet = useMemo(() => new Set(playerLevels), [playerLevels])

  const levels = useMemo(() => {
    const lvls = new Set<string>()
    programs.forEach(p => {
      if (p.level) lvls.add(p.level)
      const nameLower = p.name.toLowerCase()
      for (const l of ['red', 'orange', 'green', 'yellow', 'blue']) {
        if (nameLower.includes(l)) lvls.add(l)
      }
    })
    const order = ['red', 'orange', 'green', 'yellow', 'blue', 'competitive']
    return [...lvls].sort((a, b) => {
      const iA = order.indexOf(a)
      const iB = order.indexOf(b)
      return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB)
    })
  }, [programs])

  const types = useMemo(() => [...new Set(programs.map(p => p.type).filter(Boolean))].sort(), [programs])

  // Build a map of program ID → program for quick lookup
  const programMap = useMemo(() => {
    const map = new Map<string, Program>()
    programs.forEach(p => map.set(p.id, p))
    return map
  }, [programs])

  // Programs the family is enrolled in
  const enrolledProgramIds = useMemo(() => {
    const ids = new Set<string>()
    programs.forEach(p => {
      const familyEnrolled = (p.program_roster ?? []).some(
        r => r.status === 'enrolled' && playerIds.has(r.player_id)
      )
      if (familyEnrolled) ids.add(p.id)
    })
    return ids
  }, [programs, playerIds])

  // Map of programId → enrolled family playerIds (for calendar booking UI)
  const enrolledPlayersMap: EnrolledPlayersMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    programs.forEach(p => {
      const enrolled = (p.program_roster ?? [])
        .filter(r => r.status === 'enrolled' && playerIds.has(r.player_id))
        .map(r => r.player_id)
      if (enrolled.length > 0) map[p.id] = enrolled
    })
    return map
  }, [programs, playerIds])

  // Programs matching family player levels (recommended)
  const recommendedProgramIds = useMemo(() => {
    const ids = new Set<string>()
    programs.forEach(p => {
      if (playerLevelSet.has(p.level ?? '')) ids.add(p.id)
    })
    return ids
  }, [programs, playerLevelSet])

  // Build calendar events from sessions
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return sessions
      .filter(s => {
        const prog = programMap.get(s.program_id)
        if (!prog) return false
        if (!s.start_time || !s.end_time) return false

        // Apply "For your players" filter
        if (calendarFilter === 'mine') {
          return enrolledProgramIds.has(s.program_id) || recommendedProgramIds.has(s.program_id)
        }
        return true
      })
      .map(s => {
        const prog = programMap.get(s.program_id)!
        const roster = prog.program_roster ?? []
        const enrolledCount = roster.filter(r => r.status === 'enrolled').length
        const spotsLeft = prog.max_capacity ? prog.max_capacity - enrolledCount : null
        const isEnrolled = enrolledProgramIds.has(prog.id)

        // Pick level-based color, solid for enrolled, lighter for available
        const levelKey = prog.level?.split('-')[0] ?? ''
        const colors = LEVEL_CAL_COLORS[levelKey] ?? DEFAULT_CAL_COLORS
        const color = isEnrolled ? colors.enrolled : colors.available

        const eventDate = new Date(s.date + 'T12:00:00')
        const dayOfWeek = eventDate.getDay()

        return {
          id: s.id,
          title: formatCalendarTitle(prog.name, prog.type),
          subtitle: prog.type,
          dayOfWeek,
          startTime: s.start_time!,
          endTime: s.end_time!,
          color,
          href: `/parent/programs/${prog.id}`,
          programType: prog.type,
          date: s.date,
          sessionId: s.id,
          programId: prog.id,
          priceCents: prog.per_session_cents,
          termFeeCents: prog.term_fee_cents,
          earlyBirdPct: prog.early_pay_discount_pct,
          earlyBirdDeadline: prog.early_bird_deadline,
          isEnrolled,
          spotsLeft,
        }
      })
  }, [sessions, programMap, calendarFilter, enrolledProgramIds, recommendedProgramIds])

  const filteredByLevel = levelFilter ? filterByLevel(programs, levelFilter) : programs
  const filteredByType = typeFilter ? programs.filter(p => p.type === typeFilter) : programs

  const tabDefs: { key: Tab; label: string; icon: typeof Calendar }[] = [
    { key: 'calendar', label: 'Calendar', icon: Calendar },
    { key: 'list', label: 'All', icon: List },
    { key: 'level', label: 'Level', icon: Layers },
    { key: 'type', label: 'Type', icon: Tag },
  ]

  function ProgramGrid({ items }: { items: Program[] }) {
    if (items.length === 0) return <p className="mt-4 text-center text-sm text-muted-foreground">No programs match.</p>
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((p, i) => <ProgramCard key={p.id} program={p} familyPlayerIds={playerIds} index={i} />)}
      </div>
    )
  }

  return (
    <div>
      {/* Primary tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 shadow-sm">
        {tabDefs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setLevelFilter(''); setTypeFilter('') }}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              tab === key
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'calendar' && (
        <div className="mt-4">
          {/* Calendar filter toggle */}
          <div className="mb-3 flex items-center gap-1">
            <button
              onClick={() => setCalendarFilter('all')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                calendarFilter === 'all'
                  ? 'bg-[#2B5EA7] text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Calendar className="size-3" />
              All sessions
            </button>
            <button
              onClick={() => setCalendarFilter('mine')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                calendarFilter === 'mine'
                  ? 'bg-[#2B5EA7] text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Filter className="size-3" />
              For your players
            </button>
          </div>

          {calendarEvents.length > 0 || sessions.length > 0 ? (
            <WeeklyCalendar
              events={calendarEvents}
              players={familyPlayers}
              enrolledPlayersMap={enrolledPlayersMap}
              onBookSession={bookSession}
              onMarkAway={markSessionAway}
            />
          ) : (
            <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No scheduled sessions.</p>
          )}
        </div>
      )}

      {tab === 'list' && (
        <div className="mt-4">
          <ProgramGrid items={programs} />
        </div>
      )}

      {/* Level tab — color-coded pill buttons */}
      {tab === 'level' && (
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setLevelFilter('')}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                !levelFilter ? 'bg-foreground text-background shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              All
            </button>
            {levels.map(l => {
              const style = LEVEL_PILL_STYLES[l] ?? { active: 'bg-primary text-white shadow-sm', inactive: 'bg-muted text-muted-foreground hover:bg-accent' }
              return (
                <button
                  key={l}
                  onClick={() => setLevelFilter(l === levelFilter ? '' : l)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                    levelFilter === l ? style.active : style.inactive
                  }`}
                >
                  {l}
                </button>
              )
            })}
          </div>
          <ProgramGrid items={filteredByLevel} />
        </div>
      )}

      {/* Type tab — colored pill buttons */}
      {tab === 'type' && (
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter('')}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                !typeFilter ? 'bg-foreground text-background shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              All
            </button>
            {types.map(t => {
              const style = TYPE_PILL_STYLES[t] ?? { active: 'bg-primary text-white shadow-sm', inactive: 'bg-muted text-muted-foreground hover:bg-accent' }
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t === typeFilter ? '' : t)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                    typeFilter === t ? style.active : style.inactive
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
          <ProgramGrid items={filteredByType} />
        </div>
      )}
    </div>
  )
}
