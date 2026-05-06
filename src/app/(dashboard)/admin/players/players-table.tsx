'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpDown, Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { updatePlayerInline } from '../actions'

type GenderValue = 'male' | 'female' | 'non_binary' | null
type GenderUiValue = 'unset' | 'male' | 'female' | 'non_binary'

interface PlayerRow {
  id: string
  firstName: string
  lastName: string
  preferredName: string | null
  dob: string | null
  ballColor: string | null
  level: string | null
  gender: string | null
  status: 'active' | 'inactive' | 'archived'
  classifications: string[]
  track: 'performance' | 'participation'
  mediaConsent: 'none' | 'partial' | 'all'
  compInterest: string | null
  familyId: string
  familyDisplayId: string
  familyName: string
  programs: string[]
  comps: { compName: string; teamName: string; role: string; regStatus: string; utr: string | null; compId: string }[]
  utr: string | null
}

type SortKey = 'firstName' | 'lastName' | 'dob' | 'age' | 'ballColor' | 'family' | 'utr' | 'compStatus' | 'track' | 'status' | 'gender'

function calcAge(dob: string | null): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

const BALL_ORDER: Record<string, number> = { blue: 0, red: 1, orange: 2, green: 3, yellow: 4, competitive: 5 }

const ALL_CLASSIFICATIONS = ['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'] as const
type Classification = (typeof ALL_CLASSIFICATIONS)[number]

const CLASS_PILL: Record<Classification, { active: string; inactive: string }> = {
  blue:     { active: 'bg-ball-blue text-white border-ball-blue',         inactive: 'bg-ball-blue/10 text-ball-blue border-ball-blue/30 hover:bg-ball-blue/20' },
  red:      { active: 'bg-ball-red text-white border-ball-red',           inactive: 'bg-ball-red/10 text-ball-red border-ball-red/30 hover:bg-ball-red/20' },
  orange:   { active: 'bg-ball-orange text-white border-ball-orange',     inactive: 'bg-ball-orange/10 text-ball-orange border-ball-orange/30 hover:bg-ball-orange/20' },
  green:    { active: 'bg-ball-green text-white border-ball-green',       inactive: 'bg-ball-green/10 text-ball-green border-ball-green/30 hover:bg-ball-green/20' },
  yellow:   { active: 'bg-ball-yellow text-black border-ball-yellow',     inactive: 'bg-ball-yellow/10 text-yellow-700 border-ball-yellow/30 hover:bg-ball-yellow/20' },
  advanced: { active: 'bg-primary text-white border-primary',             inactive: 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20' },
  elite:    { active: 'bg-foreground text-background border-foreground',  inactive: 'bg-foreground/10 text-foreground border-foreground/30 hover:bg-foreground/20' },
}

const CLASS_INITIAL: Record<Classification, string> = {
  blue: 'B', red: 'R', orange: 'O', green: 'G', yellow: 'Y', advanced: 'A', elite: 'E',
}

const TRACK_STYLES: Record<'performance' | 'participation', string> = {
  performance:   'bg-primary/10 text-primary border-primary/30',
  participation: 'bg-muted text-muted-foreground border-border',
}

const STATUS_STYLES: Record<string, string> = {
  active:   'bg-success/10 text-success border-success/30',
  inactive: 'bg-warning/10 text-warning border-warning/30',
  archived: 'bg-muted text-muted-foreground border-border',
}

const GENDER_STYLES: Record<GenderUiValue, string> = {
  unset:      'bg-warning/10 text-warning border-warning/40',
  male:       'bg-sky-100 text-sky-700 border-sky-300',
  female:     'bg-pink-100 text-pink-700 border-pink-300',
  non_binary: 'bg-violet-100 text-violet-700 border-violet-300',
}

const GENDER_SORT_ORDER: Record<GenderUiValue, number> = {
  female: 0,
  male: 1,
  non_binary: 2,
  unset: 3,
}

function genderToUi(g: string | null): GenderUiValue {
  if (g === 'male' || g === 'female' || g === 'non_binary') return g
  return 'unset'
}

function uiToGender(g: GenderUiValue): GenderValue {
  return g === 'unset' ? null : g
}

// ── Inline editing cells ──────────────────────────────────────────────────────

function ClassificationsCell({
  value,
  onChange,
  saving,
}: {
  value: string[]
  onChange: (next: string[]) => void
  saving: boolean
}) {
  const set = useMemo(() => new Set(value), [value])

  function toggle(c: Classification) {
    const next = new Set(set)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    onChange([...next])
  }

  return (
    <div className="flex items-center gap-1">
      {ALL_CLASSIFICATIONS.map(c => {
        const active = set.has(c)
        const style = CLASS_PILL[c]
        return (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            title={c}
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-bold transition-colors',
              active ? style.active : style.inactive,
            )}
          >
            {CLASS_INITIAL[c]}
          </button>
        )
      })}
      {saving && <Loader2 className="ml-1 size-3 animate-spin text-muted-foreground" />}
    </div>
  )
}

function InlineSelect<T extends string>({
  value,
  options,
  onChange,
  styles,
  saving,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  styles: Record<string, string>
  saving: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          'rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize focus:outline-none focus:ring-1 focus:ring-primary',
          styles[value] ?? 'bg-muted text-muted-foreground border-border',
        )}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </div>
  )
}

// ── Row state hook: optimistic local copy + save ──────────────────────────────

function useRowState(initial: PlayerRow) {
  const [row, setRow] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function patch(update: {
    classifications?: string[]
    track?: 'performance' | 'participation'
    status?: 'active' | 'inactive' | 'archived'
    gender?: GenderValue
  }) {
    const before = row
    const next = { ...row, ...update }
    setRow(next)
    setError(null)
    startTransition(async () => {
      const res = await updatePlayerInline(row.id, update)
      if (res.error) {
        setRow(before)
        setError(res.error)
      }
    })
  }

  return { row, patch, saving: isPending, error }
}

// ── Editable row ──────────────────────────────────────────────────────────────

function EditableRow({ player }: { player: PlayerRow }) {
  const { row, patch, saving, error } = useRowState(player)

  return (
    <TableRow className={error ? 'bg-danger/5' : undefined}>
      <TableCell>
        <Link href={`/admin/families/${row.familyId}/players/${row.id}`} className="font-medium hover:text-primary transition-colors">
          {row.firstName}
        </Link>
      </TableCell>
      <TableCell>
        <Link href={`/admin/families/${row.familyId}/players/${row.id}`} className="hover:text-primary transition-colors">
          {row.lastName}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums text-xs">
        {row.dob ? new Date(row.dob).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
      </TableCell>
      <TableCell className="tabular-nums">{calcAge(row.dob) ?? '-'}</TableCell>
      <TableCell>
        <Link href={`/admin/families/${row.familyId}`} className="text-muted-foreground hover:text-primary transition-colors">
          {row.familyDisplayId}
        </Link>
      </TableCell>
      <TableCell>
        <ClassificationsCell
          value={row.classifications}
          onChange={(next) => patch({ classifications: next })}
          saving={saving}
        />
      </TableCell>
      <TableCell>
        <InlineSelect
          value={row.track}
          options={[
            { value: 'performance', label: 'Performance' },
            { value: 'participation', label: 'Participation' },
          ]}
          onChange={(next) => patch({ track: next })}
          styles={TRACK_STYLES}
          saving={false}
        />
      </TableCell>
      <TableCell>
        <InlineSelect<GenderUiValue>
          value={genderToUi(row.gender)}
          options={[
            { value: 'unset', label: 'Unset' },
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
            { value: 'non_binary', label: 'Non-binary' },
          ]}
          onChange={(next) => patch({ gender: uiToGender(next) })}
          styles={GENDER_STYLES}
          saving={false}
        />
      </TableCell>
      <TableCell>
        <InlineSelect
          value={row.status}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'archived', label: 'Archived' },
          ]}
          onChange={(next) => patch({ status: next })}
          styles={STATUS_STYLES}
          saving={false}
        />
      </TableCell>
      <TableCell className="max-w-[150px] text-xs text-muted-foreground">
        <span className="line-clamp-1">{row.programs.length > 0 ? row.programs.join(', ') : '-'}</span>
      </TableCell>
      <TableCell className="tabular-nums">{row.utr ?? '-'}</TableCell>
      <TableCell>
        {row.comps.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.comps.map((c, i) => (
              <Link
                key={i}
                href={`/admin/competitions/${c.compId}`}
                className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-200 transition-colors"
              >
                {c.compName}
              </Link>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  )
}

// ── Main table ────────────────────────────────────────────────────────────────

export function PlayersTable({ players }: { players: PlayerRow[] }) {
  const [search, setSearch] = useState('')
  const [ballFilter, setBallFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [trackFilter, setTrackFilter] = useState<'all' | 'performance' | 'participation'>('all')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'inactive' | 'archived'>('active')
  const [compFilter, setCompFilter] = useState<'all' | 'in_comp' | 'not_in_comp'>('all')
  const [genderFilter, setGenderFilter] = useState<'all' | 'unset' | 'female' | 'male' | 'non_binary'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('lastName')
  const [sortAsc, setSortAsc] = useState(true)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const filtered = useMemo(() => {
    let list = players

    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter)
    }

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        (p.preferredName?.toLowerCase().includes(q)) ||
        p.familyName.toLowerCase().includes(q) ||
        p.familyDisplayId.toLowerCase().includes(q)
      )
    }

    if (ballFilter) {
      list = list.filter(p => p.ballColor === ballFilter)
    }

    if (classFilter) {
      list = list.filter(p => p.classifications.includes(classFilter))
    }

    if (trackFilter !== 'all') {
      list = list.filter(p => p.track === trackFilter)
    }

    if (genderFilter !== 'all') {
      list = list.filter(p => genderToUi(p.gender) === genderFilter)
    }

    if (compFilter === 'in_comp') {
      list = list.filter(p => p.comps.length > 0)
    } else if (compFilter === 'not_in_comp') {
      list = list.filter(p => p.comps.length === 0)
    }

    return list
  }, [players, search, ballFilter, classFilter, trackFilter, statusFilter, genderFilter, compFilter])

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'firstName':
          return dir * a.firstName.localeCompare(b.firstName)
        case 'lastName':
          return dir * a.lastName.localeCompare(b.lastName)
        case 'dob': {
          const aDate = a.dob ?? ''
          const bDate = b.dob ?? ''
          return dir * aDate.localeCompare(bDate)
        }
        case 'age': {
          const aAge = calcAge(a.dob) ?? 999
          const bAge = calcAge(b.dob) ?? 999
          return dir * (aAge - bAge)
        }
        case 'ballColor': {
          const aOrd = BALL_ORDER[a.ballColor ?? ''] ?? 99
          const bOrd = BALL_ORDER[b.ballColor ?? ''] ?? 99
          return dir * (aOrd - bOrd)
        }
        case 'family':
          return dir * a.familyDisplayId.localeCompare(b.familyDisplayId)
        case 'utr': {
          const aUtr = parseFloat(a.utr ?? '0') || 0
          const bUtr = parseFloat(b.utr ?? '0') || 0
          return dir * (aUtr - bUtr)
        }
        case 'compStatus': {
          return dir * (a.comps.length - b.comps.length)
        }
        case 'track':
          return dir * a.track.localeCompare(b.track)
        case 'status':
          return dir * a.status.localeCompare(b.status)
        case 'gender':
          return dir * (GENDER_SORT_ORDER[genderToUi(a.gender)] - GENDER_SORT_ORDER[genderToUi(b.gender)])
        default:
          return 0
      }
    })
  }, [filtered, sortKey, sortAsc])

  const unsetGenderCount = useMemo(
    () => players.filter(p => p.status === 'active' && genderToUi(p.gender) === 'unset').length,
    [players],
  )

  const SortHeader = ({ label, sortId }: { label: string; sortId: SortKey }) => (
    <button
      onClick={() => toggleSort(sortId)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      <ArrowUpDown className={`size-3 ${sortKey === sortId ? 'text-primary' : 'text-muted-foreground/50'}`} />
    </button>
  )

  const selectClasses = 'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="mt-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name or family..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={selectClasses}>
          <option value="active">Active only</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
          <option value="all">All statuses</option>
        </select>
        <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value as typeof trackFilter)} className={selectClasses}>
          <option value="all">All tracks</option>
          <option value="performance">Performance</option>
          <option value="participation">Participation</option>
        </select>
        <select value={ballFilter} onChange={(e) => setBallFilter(e.target.value)} className={selectClasses}>
          <option value="">All ball colours</option>
          <option value="blue">Blue</option>
          <option value="red">Red</option>
          <option value="orange">Orange</option>
          <option value="green">Green</option>
          <option value="yellow">Yellow</option>
          <option value="competitive">Competitive</option>
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={selectClasses}>
          <option value="">All classifications</option>
          {ALL_CLASSIFICATIONS.map(c => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>
        <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value as typeof genderFilter)} className={selectClasses}>
          <option value="all">All genders</option>
          <option value="unset">Unset{unsetGenderCount > 0 ? ` (${unsetGenderCount})` : ''}</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="non_binary">Non-binary</option>
        </select>
        <select value={compFilter} onChange={(e) => setCompFilter(e.target.value as typeof compFilter)} className={selectClasses}>
          <option value="all">All players</option>
          <option value="in_comp">In a comp</option>
          <option value="not_in_comp">Not in comp</option>
        </select>
        <span className="text-sm text-muted-foreground">{sorted.length} players</span>
      </div>

      {/* Inline-edit hint */}
      <p className="mt-3 text-xs text-muted-foreground">
        Click classification chips to toggle. Track, gender, and status save on change.
      </p>

      {/* Mobile cards (read-only — use desktop for editing) */}
      <div className="mt-4 space-y-3 md:hidden">
        {sorted.map((p) => {
          const genderUi = genderToUi(p.gender)
          return (
            <Link
              key={p.id}
              href={`/admin/families/${p.familyId}/players/${p.id}`}
              className="block rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{p.firstName} {p.lastName}</p>
                  <p className="text-xs text-muted-foreground">{p.familyDisplayId} - {p.familyName}</p>
                </div>
                {p.ballColor && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{p.ballColor}</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {p.dob && <span>Age {calcAge(p.dob)}</span>}
                {p.utr && <span>UTR {p.utr}</span>}
                <span className={cn('rounded-full px-2 py-0.5 capitalize border', GENDER_STYLES[genderUi])}>
                  {genderUi === 'non_binary' ? 'Non-binary' : genderUi}
                </span>
                {p.classifications.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                    {p.classifications.join(', ')}
                  </span>
                )}
                <span className={cn('rounded-full px-2 py-0.5 capitalize border', TRACK_STYLES[p.track])}>{p.track}</span>
                {p.status !== 'active' && (
                  <span className={cn('rounded-full px-2 py-0.5 capitalize border', STATUS_STYLES[p.status])}>{p.status}</span>
                )}
                {p.comps.length > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                    {p.comps.map(c => c.compName).join(', ')}
                  </span>
                )}
                {p.programs.length > 0 && <span>{p.programs.length} program{p.programs.length > 1 ? 's' : ''}</span>}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Desktop table — inline editing for classifications, track, gender, status */}
      <div className="mt-4 hidden overflow-hidden rounded-lg border border-border bg-card shadow-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead><SortHeader label="First" sortId="firstName" /></TableHead>
              <TableHead><SortHeader label="Last" sortId="lastName" /></TableHead>
              <TableHead><SortHeader label="DOB" sortId="dob" /></TableHead>
              <TableHead><SortHeader label="Age" sortId="age" /></TableHead>
              <TableHead><SortHeader label="Family" sortId="family" /></TableHead>
              <TableHead>Classifications</TableHead>
              <TableHead><SortHeader label="Track" sortId="track" /></TableHead>
              <TableHead><SortHeader label="Gender" sortId="gender" /></TableHead>
              <TableHead><SortHeader label="Status" sortId="status" /></TableHead>
              <TableHead>Programs</TableHead>
              <TableHead><SortHeader label="UTR" sortId="utr" /></TableHead>
              <TableHead><SortHeader label="Comp" sortId="compStatus" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <EditableRow key={p.id} player={p} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
