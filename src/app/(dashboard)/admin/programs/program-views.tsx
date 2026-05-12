'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { StatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { List, Layers, Tag, MapPin, ArrowUpDown } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

export type SessionTally = { completed: number; cancelled: number; planned: number; scheduled?: number }

export type ProgramCoachAssignment = { lead: string; assistants: string[] }

type Tab = 'list' | 'level' | 'type' | 'venue'

const tabs: { key: Tab; label: string; icon: typeof List }[] = [
  { key: 'list', label: 'List', icon: List },
  { key: 'level', label: 'Level', icon: Layers },
  { key: 'type', label: 'Type', icon: Tag },
  { key: 'venue', label: 'Venue', icon: MapPin },
]

function ProgramCard({ program, tally, coaches }: { program: Program; tally?: SessionTally; coaches?: ProgramCoachAssignment }) {
  const enrolled = program.program_roster?.[0]?.count ?? 0
  const sessionCount = tally ? (tally.scheduled ?? tally.completed + tally.planned) : 0
  const termPrice = program.per_session_cents && sessionCount > 0
    ? program.per_session_cents * sessionCount
    : null
  const assistantCount = coaches?.assistants.length ?? 0
  const coachLabel = coaches?.lead
    ? assistantCount > 0
      ? `${coaches.lead} +${assistantCount}`
      : coaches.lead
    : assistantCount > 0
      ? `+${assistantCount}`
      : null
  const coachTitle = coaches
    ? `Lead: ${coaches.lead || '—'}${assistantCount > 0 ? ` · Assistants: ${coaches.assistants.join(', ')}` : ''}`
    : undefined

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
        {coachLabel && <span title={coachTitle}>{coachLabel}</span>}
        {program.venues && <span>{program.venues.name}</span>}
      </div>
      {(program.per_session_cents || tally) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs tabular-nums">
          {tally && (
            <span className="text-muted-foreground" title={`${tally.completed} done / ${tally.cancelled} cancelled / ${tally.planned} planned`}>
              <span className="text-success">{tally.completed}</span>
              {'/'}
              <span className="text-danger">{tally.cancelled}</span>
              {'/'}
              <span>{tally.planned}</span>
              {' sessions'}
            </span>
          )}
          {program.per_session_cents && (
            <span className="text-muted-foreground">{formatCurrency(program.per_session_cents)}/session</span>
          )}
          {termPrice && (
            <span className="ml-auto font-semibold text-foreground">{formatCurrency(termPrice)} term</span>
          )}
        </div>
      )}
    </Link>
  )
}

function ProgramCards({ programs, tallies, coaches }: { programs: Program[]; tallies?: Record<string, SessionTally>; coaches?: Record<string, ProgramCoachAssignment> }) {
  if (programs.length === 0) {
    return <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No programs match.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((p) => <ProgramCard key={p.id} program={p} tally={tallies?.[p.id]} coaches={coaches?.[p.id]} />)}
    </div>
  )
}

function filterByLevel(programs: Program[], level: string): Program[] {
  return programs.filter(p => {
    if (p.level === level) return true
    const nameLower = p.name.toLowerCase()
    return nameLower.includes(level.toLowerCase())
  })
}

type SortKey = 'name' | 'type' | 'level' | 'day' | null
type SortDir = 'asc' | 'desc'

const LEVEL_ORDER: Record<string, number> = { blue: 0, red: 1, orange: 2, green: 3, yellow: 4, competitive: 5 }

function sortPrograms(programs: Program[], key: SortKey, dir: SortDir): Program[] {
  if (!key) return programs
  return [...programs].sort((a, b) => {
    let cmp = 0
    if (key === 'type') cmp = (a.type ?? '').localeCompare(b.type ?? '')
    else if (key === 'level') cmp = (LEVEL_ORDER[a.level ?? ''] ?? 99) - (LEVEL_ORDER[b.level ?? ''] ?? 99)
    else if (key === 'day') cmp = (a.day_of_week ?? 99) - (b.day_of_week ?? 99) || (a.start_time ?? '').localeCompare(b.start_time ?? '')
    else if (key === 'name') cmp = a.name.localeCompare(b.name)
    return dir === 'desc' ? -cmp : cmp
  })
}

export function ProgramViews({ programs, sessionTallies, programCoaches }: { programs: Program[]; sessionTallies?: Record<string, SessionTally>; programCoaches?: Record<string, ProgramCoachAssignment> }) {
  const [tab, setTab] = useState<Tab>('list')
  const [levelFilter, setLevelFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedPrograms = useMemo(() => sortPrograms(programs, sortKey, sortDir), [programs, sortKey, sortDir])

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

      {/* List tab */}
      {tab === 'list' && (
        <>
          <div className="mt-4 space-y-3 md:hidden">
            {sortedPrograms.map((p) => <ProgramCard key={p.id} program={p} tally={sessionTallies?.[p.id]} coaches={programCoaches?.[p.id]} />)}
          </div>
          <div className="mt-4 hidden md:block">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Name</TableHead>
                    <TableHead><button onClick={() => toggleSort('type')} className="flex items-center gap-1 hover:text-foreground"><span>Type</span><ArrowUpDown className="size-3" /></button></TableHead>
                    <TableHead><button onClick={() => toggleSort('level')} className="flex items-center gap-1 hover:text-foreground"><span>Level</span><ArrowUpDown className="size-3" /></button></TableHead>
                    <TableHead><button onClick={() => toggleSort('day')} className="flex items-center gap-1 hover:text-foreground"><span>Day / Time</span><ArrowUpDown className="size-3" /></button></TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Coaches</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead className="text-right">Per Session</TableHead>
                    <TableHead className="text-right">Term Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPrograms.map((p) => {
                    const enrolled = p.program_roster?.[0]?.count ?? 0
                    const t = sessionTallies?.[p.id]
                    const sessionCount = t ? (t.scheduled ?? t.completed + t.planned) : 0
                    const termPrice = p.per_session_cents && sessionCount > 0
                      ? p.per_session_cents * sessionCount
                      : null
                    const coaches = programCoaches?.[p.id]
                    const assistantCount = coaches?.assistants.length ?? 0
                    const coachTitle = coaches
                      ? `Lead: ${coaches.lead || '—'}${assistantCount > 0 ? ` · Assistants: ${coaches.assistants.join(', ')}` : ''}`
                      : undefined
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
                        <TableCell className="text-muted-foreground" title={coachTitle}>
                          {coaches?.lead ? (
                            <>
                              <span className="text-foreground">{coaches.lead}</span>
                              {assistantCount > 0 && <span className="ml-1">+{assistantCount}</span>}
                            </>
                          ) : assistantCount > 0 ? (
                            <span>+{assistantCount}</span>
                          ) : (
                            <span>-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums text-xs">
                          {t ? (
                            <span title={`${t.completed} completed / ${t.cancelled} cancelled / ${t.planned} planned`}>
                              <span className="text-success">{t.completed}</span>
                              {'/'}
                              <span className="text-danger">{t.cancelled}</span>
                              {'/'}
                              <span>{t.planned}</span>
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {p.per_session_cents ? formatCurrency(p.per_session_cents) : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {termPrice ? formatCurrency(termPrice) : '-'}
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
          <ProgramCards programs={filteredByLevel} tallies={sessionTallies} coaches={programCoaches} />
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
          <ProgramCards programs={filteredByType} tallies={sessionTallies} coaches={programCoaches} />
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
          <ProgramCards programs={filteredByVenue} tallies={sessionTallies} coaches={programCoaches} />
        </div>
      )}
    </div>
  )
}
