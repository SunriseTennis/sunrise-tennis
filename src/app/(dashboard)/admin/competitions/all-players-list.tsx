'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, LinkIcon, X, Pencil } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { updateCompPlayerUTRDirect } from '@/app/(dashboard)/admin/competitions/actions'

interface CompPlayer {
  id: string
  first_name: string
  last_name: string | null
  role: string
  registration_status: string
  player_id: string | null
  sort_order: number | null
  team_name: string
  team_division: string | null
  team_gender: string | null
  comp_name: string
  comp_type: string
  utr_rating_display: string | null
}

type GroupMode = 'competition' | 'name'

function compSortKey(compName: string): number {
  const lower = compName.toLowerCase()
  // Friday Night replaces JSL — stays first in list
  if (lower.includes('friday night') || lower.includes('fri night')) return 0
  if (lower.includes('jsl') || lower.includes('junior state league')) return 0
  if (lower.includes('glenelg') || lower.includes('g&wd') || lower.includes('western district')) return 1
  if (lower.includes('pennant') || lower.includes('senior')) return 3
  return 4
}

function divisionSortKey(division: string | null): number {
  if (!division) return 999
  const lower = division.toLowerCase()
  if (lower.includes('premier')) return 0
  if (lower.includes('a1')) return 1
  const match = lower.match(/(\d+)/)
  if (match) return parseInt(match[1], 10) + 1
  return 500
}

function isGWD(compName: string): boolean {
  const lower = compName.toLowerCase()
  return lower.includes('glenelg') || lower.includes('g&wd') || lower.includes('western district')
}

// Returns a tuple for multi-key sort: [compOrder, genderOrder, divOrder, teamName]
function teamSortTuple(player: CompPlayer): [number, number, number, string] {
  const compOrder = compSortKey(player.comp_name)
  // G&WD: female (0) before male (1); other comps: no gender distinction (0)
  const genderOrder = isGWD(player.comp_name)
    ? (player.team_gender === 'female' ? 0 : 1)
    : 0
  const divOrder = divisionSortKey(player.team_division)
  return [compOrder, genderOrder, divOrder, player.team_name]
}

function compareTeamTuples(a: CompPlayer, b: CompPlayer): number {
  const ta = teamSortTuple(a)
  const tb = teamSortTuple(b)
  for (let i = 0; i < ta.length; i++) {
    const va = ta[i] as number | string
    const vb = tb[i] as number | string
    if (va < vb) return -1
    if (va > vb) return 1
  }
  return 0
}

// ── Contact popup ────────────────────────────────────────────────────

interface ContactInfo {
  player_name: string
  family_name: string | null
  primary: { name?: string; phone?: string; role?: string } | null
  secondary: { name?: string; phone?: string; role?: string } | null
}

function ContactPopup({
  playerId,
  playerName,
  onClose,
}: {
  playerId: string
  playerName: string
  onClose: () => void
}) {
  const [contact, setContact] = useState<ContactInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/admin/player-contact?playerId=${playerId}`)
      .then((r) => r.json())
      .then((data) => { setContact(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [playerId])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-background shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-xs font-semibold text-foreground">{playerName}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="px-3 py-2">
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!loading && !contact && <p className="text-xs text-muted-foreground">No contact found</p>}
        {!loading && contact && (
          <div className="space-y-1.5">
            {contact.primary && (
              <div>
                <p className="text-xs font-medium text-foreground">
                  {contact.primary.name}
                  {contact.primary.role && (
                    <span className="ml-1 font-normal text-muted-foreground capitalize">({contact.primary.role})</span>
                  )}
                </p>
                {contact.primary.phone && (
                  <a href={`tel:${contact.primary.phone}`} className="text-xs text-primary hover:underline">
                    {contact.primary.phone}
                  </a>
                )}
              </div>
            )}
            {contact.secondary && (contact.secondary.name || contact.secondary.phone) && (
              <div>
                <p className="text-xs font-medium text-foreground">
                  {contact.secondary.name}
                  {contact.secondary.role && (
                    <span className="ml-1 font-normal text-muted-foreground capitalize">({contact.secondary.role})</span>
                  )}
                </p>
                {contact.secondary.phone && (
                  <a href={`tel:${contact.secondary.phone}`} className="text-xs text-primary hover:underline">
                    {contact.secondary.phone}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline UTR Edit ──────────────────────────────────────────────────

function UTRCell({
  compPlayerId,
  initialValue,
}: {
  compPlayerId: string
  initialValue: string | null
}) {
  const [value, setValue] = useState(initialValue ?? '')
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(initialValue)

  async function save() {
    setEditing(false)
    await updateCompPlayerUTRDirect(compPlayerId, value)
    setSaved(value.trim() || null)
  }

  if (editing) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="h-5 w-14 rounded border border-primary bg-background px-1 text-xs font-mono focus:outline-none"
        autoFocus
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1 text-xs"
    >
      <span className={saved ? 'font-mono font-medium text-foreground' : 'text-muted-foreground'}>
        {saved ?? '—'}
      </span>
      <Pencil className="size-2.5 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity" />
    </button>
  )
}

// ── Player row ───────────────────────────────────────────────────────

function PlayerRow({ player, showTeam }: { player: CompPlayer; showTeam: boolean }) {
  const [showContact, setShowContact] = useState(false)
  const fullName = `${player.first_name}${player.last_name ? ` ${player.last_name}` : ''}`

  return (
    <tr className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2">
        <div className="relative inline-block">
          {player.player_id ? (
            <button
              onClick={() => setShowContact((v) => !v)}
              className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors"
            >
              <LinkIcon className="size-2.5 text-success shrink-0" />
              {fullName}
            </button>
          ) : (
            <span className="font-medium text-foreground">{fullName}</span>
          )}
          {showContact && player.player_id && (
            <ContactPopup
              playerId={player.player_id}
              playerName={fullName}
              onClose={() => setShowContact(false)}
            />
          )}
        </div>
      </td>
      {showTeam && (
        <td className="px-4 py-2 text-sm text-muted-foreground">{player.team_name}</td>
      )}
      <td className="px-4 py-2">
        <StatusBadge status={player.role} />
      </td>
      <td className="px-4 py-2">
        <StatusBadge status={player.registration_status} />
      </td>
      <td className="px-4 py-2">
        <UTRCell compPlayerId={player.id} initialValue={player.utr_rating_display} />
      </td>
    </tr>
  )
}

// ── Main component ───────────────────────────────────────────────────

export function AllPlayersList({ players }: { players: CompPlayer[] }) {
  const [groupMode, setGroupMode] = useState<GroupMode>('competition')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return players
    const q = search.toLowerCase()
    return players.filter(
      (p) =>
        p.first_name.toLowerCase().includes(q) ||
        (p.last_name?.toLowerCase().includes(q) ?? false) ||
        p.team_name.toLowerCase().includes(q),
    )
  }, [players, search])

  const sorted = useMemo(() => {
    if (groupMode === 'name') {
      return [...filtered].sort((a, b) => {
        const lastA = (a.last_name ?? '').toLowerCase()
        const lastB = (b.last_name ?? '').toLowerCase()
        if (lastA !== lastB) return lastA.localeCompare(lastB)
        return a.first_name.toLowerCase().localeCompare(b.first_name.toLowerCase())
      })
    }
    // By team: comp order → gender (G&WD: female first) → division → team name → sort_order
    return [...filtered].sort((a, b) => {
      const teamCmp = compareTeamTuples(a, b)
      if (teamCmp !== 0) return teamCmp
      // Within the same team, respect sort_order (as set in the workspace)
      const soA = a.sort_order ?? 999
      const soB = b.sort_order ?? 999
      if (soA !== soB) return soA - soB
      return a.first_name.toLowerCase().localeCompare(b.first_name.toLowerCase())
    })
  }, [filtered, groupMode])

  // Build row list: when grouping by team, insert group header rows
  const rows = useMemo(() => {
    if (groupMode === 'name') {
      return sorted.map((p) => ({ type: 'player' as const, player: p }))
    }
    const result: Array<{ type: 'header'; label: string } | { type: 'player'; player: CompPlayer }> = []
    let lastTeam = ''
    for (const p of sorted) {
      const teamKey = p.team_name
      if (teamKey !== lastTeam) {
        result.push({ type: 'header', label: p.team_name })
        lastTeam = teamKey
      }
      result.push({ type: 'player', player: p })
    }
    return result
  }, [sorted, groupMode])

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-foreground">All Competition Players</h2>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
            <button
              onClick={() => setGroupMode('competition')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${groupMode === 'competition' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              By Team
            </button>
            <button
              onClick={() => setGroupMode('name')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${groupMode === 'name' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              By Name
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players..."
              className="h-8 w-48 rounded-lg border border-border bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {filtered.length} player{filtered.length !== 1 ? 's' : ''} across all competitions
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Player</th>
              {groupMode === 'name' && (
                <th className="px-4 py-2.5 text-left font-medium">Team</th>
              )}
              <th className="px-4 py-2.5 text-left font-medium">Role</th>
              <th className="px-4 py-2.5 text-left font-medium">Registration</th>
              <th className="px-4 py-2.5 text-left font-medium">UTR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row.type === 'header') {
                return (
                  <tr key={`h-${row.label}-${i}`} className="bg-muted/20 border-b border-border/30">
                    <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-muted-foreground">
                      {row.label}
                    </td>
                  </tr>
                )
              }
              return (
                <PlayerRow
                  key={row.player.id}
                  player={row.player}
                  showTeam={groupMode === 'name'}
                />
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No players found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
