'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { Badge } from '@/components/ui/badge'
import { WeeklyCalendar, type CalendarEvent, type EnrolledPlayersMap } from '@/components/weekly-calendar'
import { Calendar, Layers, Tag, ChevronRight, Users, Filter } from 'lucide-react'
import { bookSession, markSessionAway, cancelSessionBooking } from './actions'

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
  red: 'bg-ball-red/30 border-ball-red/50',
  orange: 'bg-ball-orange/30 border-ball-orange/50',
  green: 'bg-ball-green/30 border-ball-green/50',
  yellow: 'bg-ball-yellow/30 border-ball-yellow/50',
  competitive: 'bg-primary/15 border-primary/30',
}

/** Calendar event colors — solid for enrolled, lighter for not */
const LEVEL_CAL_COLORS: Record<string, { enrolled: string; available: string }> = {
  red:    { enrolled: 'bg-ball-red border-ball-red/80 text-white',       available: 'bg-ball-red/30 border-ball-red/50 text-foreground' },
  orange: { enrolled: 'bg-ball-orange border-ball-orange/80 text-white', available: 'bg-ball-orange/30 border-ball-orange/50 text-foreground' },
  green:  { enrolled: 'bg-ball-green border-ball-green/80 text-white',   available: 'bg-ball-green/30 border-ball-green/50 text-foreground' },
  yellow: { enrolled: 'bg-ball-yellow border-ball-yellow/80 text-black', available: 'bg-ball-yellow/30 border-ball-yellow/50 text-foreground' },
  blue:   { enrolled: 'bg-ball-blue border-ball-blue/80 text-white',     available: 'bg-ball-blue/30 border-ball-blue/50 text-foreground' },
}

const DEFAULT_CAL_COLORS = {
  enrolled: 'bg-primary border-primary/80 text-white',
  available: 'bg-primary/15 border-primary/30 text-foreground',
}

/** Raw hex values for gradient generation (composite levels like red-orange) */
const LEVEL_HEX: Record<string, string> = {
  red: '#C53030', orange: '#E86A20', green: '#2D8A4E', yellow: '#EAB308', blue: '#4A90D9',
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

type Tab = 'calendar' | 'level' | 'type'

/** Strip day prefix from program name for calendar display, clean up "Ball" and avoid double suffix */
function formatCalendarTitle(name: string): string {
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
    if (!p.level) return false
    // Exact match or composite level containing this level (e.g. "red-orange" matches "red" and "orange")
    return p.level === level || p.level.includes(level)
  })
}

type Attendance = {
  session_id: string
  player_id: string
  status: string
}

export function ParentProgramFilters({
  programs,
  sessions,
  playerLevels,
  familyPlayerIds,
  familyPlayers,
  attendances,
}: {
  programs: Program[]
  sessions: Session[]
  playerLevels: string[]
  familyPlayerIds: string[]
  familyPlayers: { id: string; name: string }[]
  attendances: Attendance[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('calendar')
  // Default level to the strongest player's level (blue = highest)
  const strongestLevel = useMemo(() => {
    const strength = ['blue', 'red', 'orange', 'green', 'yellow']
    for (const lvl of strength) {
      if (playerLevels.includes(lvl)) return lvl
    }
    return playerLevels[0] ?? ''
  }, [playerLevels])
  const [levelFilter, setLevelFilter] = useState(strongestLevel)
  const [typeFilter, setTypeFilter] = useState('group')
  const [calendarFilter, setCalendarFilter] = useState<'all' | 'mine'>('mine')
  // Type toggles for calendar: default groups+squads+comps on, schools off
  const [calendarTypes, setCalendarTypes] = useState<Set<string>>(() => new Set(['group', 'squad', 'competition', 'school']))
  const playerIds = useMemo(() => new Set(familyPlayerIds), [familyPlayerIds])
  const playerLevelSet = useMemo(() => new Set(playerLevels), [playerLevels])

  // Single-colour levels only (filter out composites like "red-orange")
  const LEVEL_ORDER = ['blue', 'red', 'orange', 'green', 'yellow', 'competitive']
  const SINGLE_LEVELS = new Set(LEVEL_ORDER)

  const levels = useMemo(() => {
    const lvls = new Set<string>()
    programs.forEach(p => {
      if (p.level && SINGLE_LEVELS.has(p.level)) lvls.add(p.level)
    })
    return [...lvls].sort((a, b) => {
      const iA = LEVEL_ORDER.indexOf(a)
      const iB = LEVEL_ORDER.indexOf(b)
      return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB)
    })
  }, [programs])

  // Fixed type order: group, squad, competition, school
  const TYPE_ORDER = ['group', 'squad', 'competition', 'school']
  const types = useMemo(() => {
    const typeSet = new Set(programs.map(p => p.type).filter(Boolean))
    return TYPE_ORDER.filter(t => typeSet.has(t))
  }, [programs])

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

  // Map of programId → enrolled family playerIds (from program_roster, for term enrollment)
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

  // Programs matching family player levels (recommended) — includes composite levels
  const recommendedProgramIds = useMemo(() => {
    const ids = new Set<string>()
    programs.forEach(p => {
      if (!p.level) return
      // Check if any player level matches the program level (exact or within composite)
      for (const pl of playerLevels) {
        if (p.level === pl || p.level.includes(pl)) {
          ids.add(p.id)
          break
        }
      }
    })
    return ids
  }, [programs, playerLevels])

  // Attendance lookup: sessionId → booking status + per-player status map
  const sessionAttendanceMap = useMemo(() => {
    const map = new Map<string, { booked: boolean; allAway: boolean; bookedPlayerIds: Set<string>; awayPlayerIds: Set<string>; playerStatus: Record<string, string> }>()
    const bySession = new Map<string, Attendance[]>()
    for (const a of attendances) {
      if (!playerIds.has(a.player_id)) continue
      const list = bySession.get(a.session_id)
      if (list) list.push(a)
      else bySession.set(a.session_id, [a])
    }
    for (const [sessionId, records] of bySession) {
      const bookedPlayerIds = new Set(records.filter(r => r.status === 'present').map(r => r.player_id))
      const awayPlayerIds = new Set(records.filter(r => r.status === 'absent').map(r => r.player_id))
      const hasPresent = bookedPlayerIds.size > 0
      const allExcused = records.length > 0 && records.every(r => r.status === 'absent')
      const playerStatus: Record<string, string> = {}
      for (const r of records) playerStatus[r.player_id] = r.status
      map.set(sessionId, { booked: hasPresent, allAway: allExcused, bookedPlayerIds, awayPlayerIds, playerStatus })
    }
    return map
  }, [attendances, playerIds])

  // Enhanced per-session map: includes both enrolled AND session-booked players
  const sessionEnrolledMap: Record<string, string[]> = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const s of sessions) {
      const prog = programMap.get(s.program_id)
      if (!prog) continue
      const enrolled = new Set(enrolledPlayersMap[prog.id] ?? [])
      // Add players who have booked this specific session
      const att = sessionAttendanceMap.get(s.id)
      if (att) {
        for (const pid of att.bookedPlayerIds) enrolled.add(pid)
      }
      if (enrolled.size > 0) map[s.id] = [...enrolled]
    }
    return map
  }, [sessions, programMap, enrolledPlayersMap, sessionAttendanceMap])

  // Count remaining scheduled sessions per program (from today onwards)
  const remainingSessionsMap = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const map = new Map<string, number>()
    for (const s of sessions) {
      if (s.date >= today) {
        map.set(s.program_id, (map.get(s.program_id) ?? 0) + 1)
      }
    }
    return map
  }, [sessions])

  // Build calendar events from sessions
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return sessions
      .filter(s => {
        const prog = programMap.get(s.program_id)
        if (!prog) return false
        if (!s.start_time || !s.end_time) return false

        // Apply type filter
        if (!calendarTypes.has(prog.type)) return false

        // Apply "For you" filter
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

        // Color logic: enrolled/booked = solid, away = faded, not enrolled = faded
        const levelParts = prog.level?.split('-') ?? []
        const levelKey = levelParts[0] ?? ''
        const colors = LEVEL_CAL_COLORS[levelKey] ?? DEFAULT_CAL_COLORS
        const att = sessionAttendanceMap.get(s.id)
        const hasBooking = isEnrolled || att?.booked === true
        const isAway = hasBooking && att?.allAway === true
        const color = (hasBooking && !isAway) ? colors.enrolled : colors.available

        // Composite levels (e.g. red-orange): use a diagonal gradient
        let colorStyle: React.CSSProperties | undefined
        if (levelParts.length >= 2 && LEVEL_HEX[levelParts[0]] && LEVEL_HEX[levelParts[1]]) {
          const hex1 = LEVEL_HEX[levelParts[0]]
          const hex2 = LEVEL_HEX[levelParts[1]]
          const opacity = (hasBooking && !isAway) ? 1 : 0.35
          colorStyle = {
            background: `linear-gradient(135deg, ${hex1} 50%, ${hex2} 50%)`,
            opacity,
            borderColor: hex1,
          }
        }

        const eventDate = new Date(s.date + 'T12:00:00')
        const dayOfWeek = eventDate.getDay()

        return {
          id: s.id,
          title: formatCalendarTitle(prog.name),
          subtitle: undefined,
          dayOfWeek,
          startTime: s.start_time!,
          endTime: s.end_time!,
          color: colorStyle ? 'border-white/40 text-white' : color,
          colorStyle,
          href: `/parent/programs/${prog.id}`,
          programType: prog.type,
          date: s.date,
          sessionId: s.id,
          programId: prog.id,
          priceCents: prog.per_session_cents,
          remainingSessions: remainingSessionsMap.get(prog.id) ?? null,
          earlyBirdPct: prog.early_pay_discount_pct,
          earlyBirdDeadline: prog.early_bird_deadline,
          isEnrolled,
          spotsLeft,
          playerAttendance: sessionAttendanceMap.get(s.id)?.playerStatus,
        }
      })
  }, [sessions, programMap, calendarFilter, calendarTypes, enrolledProgramIds, recommendedProgramIds, sessionAttendanceMap, remainingSessionsMap])

  // Apply "For you" filter globally — show only enrolled/recommended programs
  const relevantPrograms = useMemo(() => {
    if (calendarFilter === 'all') return programs
    return programs.filter(p => enrolledProgramIds.has(p.id) || recommendedProgramIds.has(p.id))
  }, [programs, calendarFilter, enrolledProgramIds, recommendedProgramIds])

  // Visible levels — in "For you" mode, only show levels players actually have
  const visibleLevels = useMemo(() => {
    if (calendarFilter === 'all') return levels
    return levels.filter(l => playerLevelSet.has(l))
  }, [levels, calendarFilter, playerLevelSet])

  const visibleTypes = useMemo(() => {
    if (calendarFilter === 'all') return types
    return types.filter(t => relevantPrograms.some(p => p.type === t))
  }, [types, calendarFilter, relevantPrograms])

  const filteredByLevel = levelFilter === '' ? relevantPrograms : filterByLevel(relevantPrograms, levelFilter)
  const filteredByType = typeFilter === '' ? relevantPrograms : relevantPrograms.filter(p => p.type === typeFilter)

  const tabDefs: { key: Tab; label: string; icon: typeof Calendar }[] = [
    { key: 'calendar', label: 'Calendar', icon: Calendar },
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

  /** Grouped program grid with section headers */
  function GroupedProgramGrid({ groups, labelMap }: { groups: { key: string; items: Program[] }[]; labelMap?: Record<string, string> }) {
    const nonEmpty = groups.filter(g => g.items.length > 0)
    if (nonEmpty.length === 0) return <p className="mt-4 text-center text-sm text-muted-foreground">No programs match.</p>
    return (
      <div className="space-y-5">
        {nonEmpty.map(g => (
          <div key={g.key}>
            <h3 className="mb-2 text-sm font-semibold capitalize text-foreground">{labelMap?.[g.key] ?? g.key}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.items.map((p, i) => <ProgramCard key={p.id} program={p} familyPlayerIds={playerIds} index={i} />)}
            </div>
          </div>
        ))}
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
            onClick={() => { setTab(key); setLevelFilter(strongestLevel); setTypeFilter('group') }}
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

      {/* Global "For you" toggle — applies across all views */}
      <div className="mt-3 flex items-center gap-1">
        <button
          onClick={() => setCalendarFilter('mine')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            calendarFilter === 'mine'
              ? 'bg-[#2B5EA7] text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Filter className="size-3" />
          For you
        </button>
        <button
          onClick={() => setCalendarFilter('all')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            calendarFilter === 'all'
              ? 'bg-[#2B5EA7] text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Calendar className="size-3" />
          All
        </button>
      </div>

      {tab === 'calendar' && (
        <div className="mt-3">
          {/* Type toggles */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {types.map(t => {
              const isOn = calendarTypes.has(t)
              const label = t === 'competition' ? 'Comps' : t === 'group' ? 'Groups' : t === 'squad' ? 'Squads' : t === 'school' ? 'Schools' : t
              return (
                <button key={t} onClick={() => {
                  setCalendarTypes(prev => {
                    const next = new Set(prev)
                    if (next.has(t)) next.delete(t)
                    else next.add(t)
                    return next
                  })
                }}
                  className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-all border',
                    isOn
                      ? (TYPE_PILL_STYLES[t]?.active ?? 'bg-primary text-white shadow-sm')
                      : (TYPE_PILL_STYLES[t]?.inactive ?? 'bg-muted text-muted-foreground') + ' line-through opacity-60'
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {calendarEvents.length > 0 || sessions.length > 0 ? (
            <WeeklyCalendar
              events={calendarEvents}
              players={familyPlayers}
              enrolledPlayersMap={enrolledPlayersMap}
              sessionEnrolledMap={sessionEnrolledMap}
              hideCapacity
              onBookSession={async (sid, pid, pids) => {
                const r = await bookSession(sid, pid, pids)
                router.refresh()
                return r
              }}
              onMarkAway={async (sid, pid) => {
                const r = await markSessionAway(sid, pid)
                router.refresh()
                return r
              }}
              onCancelSession={async (sid, pid) => {
                const r = await cancelSessionBooking(sid, pid)
                router.refresh()
                return r
              }}
            />
          ) : (
            <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No scheduled sessions.</p>
          )}
        </div>
      )}

      {/* Level tab — color-coded pill buttons */}
      {tab === 'level' && (
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {calendarFilter === 'mine' && (
              <button
                onClick={() => setLevelFilter('')}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                  !levelFilter ? 'bg-foreground text-background shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                All
              </button>
            )}
            {visibleLevels.map(l => {
              const style = LEVEL_PILL_STYLES[l] ?? { active: 'bg-primary text-white shadow-sm', inactive: 'bg-muted text-muted-foreground hover:bg-accent' }
              return (
                <button
                  key={l}
                  onClick={() => setLevelFilter(l)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                    levelFilter === l ? style.active : style.inactive
                  }`}
                >
                  {l}
                </button>
              )
            })}
          </div>
          {levelFilter === '' ? (
            <GroupedProgramGrid
              groups={visibleLevels.map(l => ({ key: l, items: filterByLevel(relevantPrograms, l) }))}
            />
          ) : (
            <ProgramGrid items={filteredByLevel} />
          )}
        </div>
      )}

      {/* Type tab — colored pill buttons */}
      {tab === 'type' && (
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {calendarFilter === 'mine' && (
              <button
                onClick={() => setTypeFilter('')}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                  !typeFilter ? 'bg-foreground text-background shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                All
              </button>
            )}
            {visibleTypes.map(t => {
              const style = TYPE_PILL_STYLES[t] ?? { active: 'bg-primary text-white shadow-sm', inactive: 'bg-muted text-muted-foreground hover:bg-accent' }
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                    typeFilter === t ? style.active : style.inactive
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
          {typeFilter === '' ? (
            <GroupedProgramGrid
              groups={visibleTypes.map(t => ({ key: t, items: relevantPrograms.filter(p => p.type === t) }))}
            />
          ) : (
            <ProgramGrid items={filteredByType} />
          )}
        </div>
      )}
    </div>
  )
}
