'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { StatusBadge } from '@/components/status-badge'
import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar, List, Layers, Tag, MapPin, Users, X, ExternalLink, Eye, CloudRain } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const LEVEL_COLORS: Record<string, string> = {
  red: 'bg-ball-red/20 border-ball-red/30',
  orange: 'bg-ball-orange/20 border-ball-orange/30',
  green: 'bg-ball-green/20 border-ball-green/30',
  yellow: 'bg-ball-yellow/20 border-ball-yellow/30',
  competitive: 'bg-primary/15 border-primary/30',
}

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
  status: string | null
  venue_id: string | null
  venues: { id: string; name: string } | null
  program_roster: { count: number }[]
}

export type SessionData = {
  id: string
  programId: string | null
  date: string
  startTime: string | null
  endTime: string | null
  status: string
  coachName: string
  venueName: string
  bookedCount: number
  leadCoach: string
  assistantCoaches: string[]
}

type Tab = 'calendar' | 'list' | 'level' | 'type' | 'venue'

const tabs: { key: Tab; label: string; icon: typeof Calendar }[] = [
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'list', label: 'List', icon: List },
  { key: 'level', label: 'Level', icon: Layers },
  { key: 'type', label: 'Type', icon: Tag },
  { key: 'venue', label: 'Venue', icon: MapPin },
]

function ProgramCard({ program }: { program: Program }) {
  const enrolled = program.program_roster?.[0]?.count ?? 0
  return (
    <Link
      href={`/admin/programs/${program.id}`}
      className="block rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30"
    >
      <div className="flex items-start justify-between">
        <p className="font-medium text-foreground">{program.name}</p>
        <StatusBadge status={program.status ?? 'active'} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {program.day_of_week != null ? DAYS[program.day_of_week] : '-'}
        {program.start_time && ` ${formatTime(program.start_time)}`}
        {program.end_time && ` - ${formatTime(program.end_time)}`}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="capitalize">{program.type}</span>
        <span className="capitalize">{program.level}</span>
        <span>{enrolled}{program.max_capacity ? `/${program.max_capacity}` : ''} enrolled</span>
        {program.venues && <span>{program.venues.name}</span>}
        {program.per_session_cents && <span className="ml-auto tabular-nums">{formatCurrency(program.per_session_cents)}/session</span>}
      </div>
    </Link>
  )
}

function ProgramCards({ programs }: { programs: Program[] }) {
  if (programs.length === 0) {
    return <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No programs match.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((p) => <ProgramCard key={p.id} program={p} />)}
    </div>
  )
}

function sessionsToCalendarEvents(sessions: SessionData[], programs: Program[]): CalendarEvent[] {
  const programMap = new Map(programs.map(p => [p.id, p]))

  return sessions
    .filter(s => s.startTime && s.endTime && s.date)
    .map(s => {
      const program = s.programId ? programMap.get(s.programId) : null
      const enrolled = program?.program_roster?.[0]?.count ?? 0
      const capacity = program?.max_capacity
      const capacityLabel = capacity ? `${s.bookedCount || enrolled}/${capacity}` : undefined
      let capacityColor: 'green' | 'amber' | 'red' | 'blue' | undefined
      if (capacity) {
        const ratio = (s.bookedCount || enrolled) / capacity
        if (ratio > 1) capacityColor = 'blue'
        else if (ratio >= 1) capacityColor = 'red'
        else if (ratio >= 0.75) capacityColor = 'amber'
        else capacityColor = 'green'
      }

      const eventDate = new Date(s.date + 'T12:00:00')
      const dayOfWeek = eventDate.getDay()

      return {
        id: s.id,
        title: program?.name ?? 'Session',
        subtitle: s.coachName,
        dayOfWeek,
        startTime: s.startTime!,
        endTime: s.endTime!,
        color: LEVEL_COLORS[program?.level ?? ''] ?? 'bg-primary/15 border-primary/30',
        date: s.date,
        sessionId: s.id,
        programId: s.programId ?? undefined,
        sessionStatus: s.status,
        coachName: s.coachName,
        bookedCount: s.bookedCount,
        capacityLabel,
        capacityColor,
        assistantCoaches: s.assistantCoaches,
      } satisfies CalendarEvent
    })
}

function toCalendarEvents(programs: Program[]): CalendarEvent[] {
  return programs
    .filter(p => p.day_of_week != null && p.start_time && p.end_time)
    .map(p => ({
      id: p.id,
      title: p.name,
      subtitle: `${p.type} - ${p.level ?? 'all'}`,
      dayOfWeek: p.day_of_week!,
      startTime: p.start_time!,
      endTime: p.end_time!,
      color: LEVEL_COLORS[p.level ?? ''] ?? 'bg-primary/15 border-primary/30',
      href: `/admin/programs/${p.id}`,
    }))
}

function filterByLevel(programs: Program[], level: string): Program[] {
  return programs.filter(p => {
    if (p.level === level) return true
    const nameLower = p.name.toLowerCase()
    return nameLower.includes(level.toLowerCase())
  })
}

/** Admin session popup content */
function AdminSessionPopup({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const STATUS_STYLES: Record<string, string> = {
    scheduled: 'bg-muted text-muted-foreground',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-danger/10 text-danger',
    rained_out: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground leading-tight">{event.title}</h3>
          {event.sessionStatus && (
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[event.sessionStatus] ?? STATUS_STYLES.scheduled}`}>
              {event.sessionStatus.replace('_', ' ')}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {event.bookedCount !== undefined && (
          <div className="flex items-center gap-2">
            <Users className="size-3.5 shrink-0" />
            <span>{event.bookedCount} player{event.bookedCount !== 1 ? 's' : ''} booked</span>
          </div>
        )}
        {event.coachName && (
          <div className="flex items-center gap-2">
            <span className="size-3.5 shrink-0 text-center text-xs font-bold">L</span>
            <span>{event.coachName}</span>
          </div>
        )}
        {event.assistantCoaches && event.assistantCoaches.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="size-3.5 shrink-0 text-center text-xs font-bold">A</span>
            <span>{event.assistantCoaches.join(', ')}</span>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex gap-2">
          {event.sessionId && event.programId && (
            <Link
              href={`/admin/programs/${event.programId}/sessions/${event.sessionId}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110"
            >
              <Eye className="size-3.5" />
              Session
            </Link>
          )}
          {event.programId && (
            <Link
              href={`/admin/programs/${event.programId}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted/50"
          >
            <ExternalLink className="size-3.5" />
            Program
          </Link>
        )}
        </div>
        {event.sessionStatus === 'scheduled' && event.sessionId && event.programId && (
          <Link
            href={`/admin/programs/${event.programId}/sessions/${event.sessionId}?rainout=1`}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100"
          >
            <CloudRain className="size-3.5" />
            Rained Out
          </Link>
        )}
      </div>
    </div>
  )
}

export type SessionTally = { completed: number; cancelled: number; planned: number }

export function ProgramViews({ programs, sessions, sessionTallies }: { programs: Program[]; sessions?: SessionData[]; sessionTallies?: Record<string, SessionTally> }) {
  const [tab, setTab] = useState<Tab>('calendar')
  const [levelFilter, setLevelFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')

  const calendarEvents = useMemo(() => {
    // If sessions are provided, show actual sessions on the calendar
    if (sessions && sessions.length > 0) {
      return sessionsToCalendarEvents(sessions, programs)
    }
    // Fallback to recurring program slots
    return toCalendarEvents(programs)
  }, [programs, sessions])

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
  const venues = useMemo(() => {
    const map = new Map<string, string>()
    programs.forEach(p => { if (p.venues) map.set(p.venues.id, p.venues.name) })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [programs])

  const filteredByLevel = levelFilter ? filterByLevel(programs, levelFilter) : programs
  const filteredByType = typeFilter ? programs.filter(p => p.type === typeFilter) : programs
  const filteredByVenue = venueFilter ? programs.filter(p => p.venue_id === venueFilter) : programs

  return (
    <div>
      {/* Primary tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setLevelFilter(''); setTypeFilter(''); setVenueFilter('') }}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Calendar tab */}
      {tab === 'calendar' && (
        <div className="mt-4">
          {calendarEvents.length > 0 ? (
            <WeeklyCalendar
              events={calendarEvents}
              renderPopup={sessions && sessions.length > 0
                ? (event, onClose) => <AdminSessionPopup event={event} onClose={onClose} />
                : undefined
              }
            />
          ) : (
            <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No scheduled sessions this term.</p>
          )}
        </div>
      )}

      {/* List tab */}
      {tab === 'list' && (
        <>
          <div className="mt-4 space-y-3 md:hidden">
            {programs.map((p) => <ProgramCard key={p.id} program={p} />)}
          </div>
          <div className="mt-4 hidden md:block">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Day / Time</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead className="text-right">Per Session</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {programs.map((p) => {
                    const enrolled = p.program_roster?.[0]?.count ?? 0
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          <Link href={`/admin/programs/${p.id}`} className="hover:text-primary transition-colors">{p.name}</Link>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">{p.type}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{p.level}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.day_of_week != null ? DAYS[p.day_of_week] : '-'}
                          {p.start_time && ` ${formatTime(p.start_time)}`}
                          {p.end_time && ` - ${formatTime(p.end_time)}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {enrolled}{p.max_capacity ? `/${p.max_capacity}` : ''}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums text-xs">
                          {(() => {
                            const t = sessionTallies?.[p.id]
                            if (!t) return '-'
                            return (
                              <span title={`${t.completed} completed / ${t.cancelled} cancelled / ${t.planned} planned`}>
                                <span className="text-success">{t.completed}</span>
                                {'/'}
                                <span className="text-danger">{t.cancelled}</span>
                                {'/'}
                                <span>{t.planned}</span>
                              </span>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {p.per_session_cents ? formatCurrency(p.per_session_cents) : '-'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status ?? 'active'} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Level tab */}
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
          <ProgramCards programs={filteredByLevel} />
        </div>
      )}

      {/* Type tab */}
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
          <ProgramCards programs={filteredByType} />
        </div>
      )}

      {/* Venue tab */}
      {tab === 'venue' && (
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setVenueFilter('')}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                !venueFilter ? 'bg-foreground text-background shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              All
            </button>
            {venues.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setVenueFilter(id === venueFilter ? '' : id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                  venueFilter === id ? 'bg-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <ProgramCards programs={filteredByVenue} />
        </div>
      )}
    </div>
  )
}
