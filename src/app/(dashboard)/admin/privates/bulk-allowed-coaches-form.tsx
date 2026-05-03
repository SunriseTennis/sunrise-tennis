'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { bulkSetPlayerAllowedCoaches } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { UserCog, X } from 'lucide-react'

interface PlayerOption {
  id: string
  first_name: string
  last_name: string
  family_id: string
  family_display_id: string
  family_name: string
}

interface CoachOption {
  id: string
  name: string
  is_owner: boolean | null
}

export function BulkAllowedCoachesForm({
  players,
  coaches,
}: {
  players: PlayerOption[]
  coaches: CoachOption[]
}) {
  const router = useRouter()

  const [mode, setMode] = useState<'replace' | 'add'>('replace')
  const [selectedCoachIds, setSelectedCoachIds] = useState<Set<string>>(new Set())
  const [autoApproveIds, setAutoApproveIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [confirmingReplace, setConfirmingReplace] = useState(false)

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as PlayerOption[]
    return players
      .filter(p => !selectedPlayerIds.has(p.id))
      .filter(p =>
        p.first_name.toLowerCase().includes(q) ||
        p.last_name.toLowerCase().includes(q) ||
        p.family_name.toLowerCase().includes(q) ||
        p.family_display_id.toLowerCase().includes(q),
      )
      .slice(0, 12)
  }, [search, players, selectedPlayerIds])

  const selectedPlayers = useMemo(
    () => players.filter(p => selectedPlayerIds.has(p.id)),
    [players, selectedPlayerIds],
  )

  function toggleCoach(coachId: string) {
    setSelectedCoachIds(prev => {
      const next = new Set(prev)
      if (next.has(coachId)) {
        next.delete(coachId)
        // also clear auto-approve for that coach
        setAutoApproveIds(p => { const n = new Set(p); n.delete(coachId); return n })
      } else {
        next.add(coachId)
      }
      return next
    })
  }

  function toggleAutoApprove(coachId: string) {
    setAutoApproveIds(prev => {
      const next = new Set(prev)
      if (next.has(coachId)) next.delete(coachId)
      else {
        next.add(coachId)
        // ensure coach itself is selected when auto-approve is on
        setSelectedCoachIds(p => { const n = new Set(p); n.add(coachId); return n })
      }
      return next
    })
  }

  function addPlayer(id: string) {
    setSelectedPlayerIds(prev => { const next = new Set(prev); next.add(id); return next })
    setSearch('')
  }

  function removePlayer(id: string) {
    setSelectedPlayerIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }

  function addAllFamily(familyId: string) {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev)
      for (const p of players) if (p.family_id === familyId) next.add(p.id)
      return next
    })
    setSearch('')
  }

  function clearAll() {
    setSelectedPlayerIds(new Set())
  }

  // Group matches by family so the dropdown is scannable.
  const matchesByFamily = useMemo(() => {
    const groups = new Map<string, { family: { id: string; display_id: string; name: string }; players: PlayerOption[] }>()
    for (const p of matches) {
      const key = p.family_id
      const existing = groups.get(key)
      if (existing) existing.players.push(p)
      else groups.set(key, { family: { id: p.family_id, display_id: p.family_display_id, name: p.family_name }, players: [p] })
    }
    return [...groups.values()]
  }, [matches])

  const submitDisabled = selectedPlayers.length === 0
  const buttonLabel = (() => {
    if (selectedPlayers.length === 0) return 'Pick players'
    if (mode === 'replace' && selectedCoachIds.size === 0) {
      return `Clear restrictions for ${selectedPlayers.length}`
    }
    return `${mode === 'replace' ? 'Replace' : 'Add'} for ${selectedPlayers.length} player${selectedPlayers.length === 1 ? '' : 's'}`
  })()

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <UserCog className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Bulk Allowed Coaches</h2>
            <p className="text-xs text-muted-foreground">Set which coaches selected players can book privates with.</p>
          </div>
        </div>

        <form
          action={async (formData) => {
            if (mode === 'replace' && !confirmingReplace) {
              setConfirmingReplace(true)
              return
            }
            formData.set('player_ids', [...selectedPlayerIds].join(','))
            for (const cid of selectedCoachIds) formData.append('coach_ids', cid)
            for (const cid of autoApproveIds) formData.append('auto_approve', cid)
            formData.set('mode', mode)
            await bulkSetPlayerAllowedCoaches(formData)
            setSelectedPlayerIds(new Set())
            setConfirmingReplace(false)
            router.refresh()
          }}
          className="mt-5 space-y-4"
        >
          {/* Mode */}
          <div>
            <Label>Mode</Label>
            <div className="mt-1 flex gap-2">
              <label className={`flex flex-1 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${mode === 'replace' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input
                  type="radio"
                  name="bulk-mode"
                  value="replace"
                  checked={mode === 'replace'}
                  onChange={() => { setMode('replace'); setConfirmingReplace(false) }}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Replace</span>
                  <span className="block text-xs text-muted-foreground">Wipe each player&apos;s existing allowlist, then set the new one.</span>
                </span>
              </label>
              <label className={`flex flex-1 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${mode === 'add' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input
                  type="radio"
                  name="bulk-mode"
                  value="add"
                  checked={mode === 'add'}
                  onChange={() => { setMode('add'); setConfirmingReplace(false) }}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Add</span>
                  <span className="block text-xs text-muted-foreground">Union the new coaches onto each player&apos;s existing allowlist.</span>
                </span>
              </label>
            </div>
          </div>

          {/* Coaches */}
          <div>
            <Label>Coaches</Label>
            <div className="mt-1 space-y-1.5 rounded-lg border border-border p-3">
              {coaches.map((coach) => {
                const checked = selectedCoachIds.has(coach.id)
                const auto = autoApproveIds.has(coach.id)
                return (
                  <div key={coach.id} className="flex items-center gap-3">
                    <label className="flex flex-1 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCoach(coach.id)}
                        className="size-4 rounded border-border"
                      />
                      {coach.name}{coach.is_owner ? ' (owner)' : ''}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={auto}
                        onChange={() => toggleAutoApprove(coach.id)}
                        className="size-3 rounded border-border"
                      />
                      Auto-approve
                    </label>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Players search */}
          <div>
            <Label htmlFor="bulk-allow-search">Add players</Label>
            <Input
              id="bulk-allow-search"
              type="text"
              placeholder="Search by player or family name (e.g. Lily or Smith or C001)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1"
            />
            {matchesByFamily.length > 0 && (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border/50">
                {matchesByFamily.map(group => (
                  <div key={group.family.id} className="p-2">
                    <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
                      <span className="text-xs font-medium text-foreground">
                        {group.family.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{group.family.display_id}</span>
                        {group.players.length > 1 && (
                          <button
                            type="button"
                            onClick={() => addAllFamily(group.family.id)}
                            className="text-[11px] text-primary hover:underline"
                          >
                            Add all ({group.players.length})
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {group.players.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addPlayer(p.id)}
                          className="block w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted/50 transition-colors"
                        >
                          {p.first_name} {p.last_name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected players */}
          {selectedPlayers.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Selected ({selectedPlayers.length})
                </p>
                {selectedPlayers.length >= 5 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-muted-foreground hover:text-danger"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedPlayers.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                  >
                    {p.family_name} — {p.first_name}
                    <button
                      type="button"
                      onClick={() => removePlayer(p.id)}
                      className="ml-0.5 rounded-full text-primary/70 hover:text-primary"
                      aria-label={`Remove ${p.first_name} ${p.last_name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {confirmingReplace && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-foreground">
              <p className="font-medium text-warning">Replace mode wipes existing allowlists.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedPlayers.length} player{selectedPlayers.length === 1 ? '' : 's'} will lose any current
                allowed-coach restrictions before the new {selectedCoachIds.size === 0 ? '(none — open access)' : `set of ${selectedCoachIds.size}`} is applied.
                Click again to confirm.
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={submitDisabled}>
              {confirmingReplace ? 'Click again to confirm' : buttonLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
