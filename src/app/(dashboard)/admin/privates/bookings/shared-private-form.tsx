'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TimePicker12h } from '@/components/ui/time-picker-12h'
import { Search, X } from 'lucide-react'
import { adminCreateSharedPrivate } from '../actions'
import { CoachRateSelect } from './coach-rate-select'

interface Player {
  id: string
  first_name: string
  last_name: string
}

interface Family {
  id: string
  display_id: string
  family_name: string
  primary_contact: { name?: string } | null
  players: Player[]
}

interface Coach {
  id: string
  name: string
  rate: number
}

interface Props {
  families: Family[]
  coaches: Coach[]
  /** When true, renders the form directly without the toggle button (e.g. inside a modal). */
  alwaysExpanded?: boolean
}

type Slot = 1 | 2

export function SharedPrivateForm({ families, coaches, alwaysExpanded = false }: Props) {
  const [showForm, setShowForm] = useState(alwaysExpanded)
  const [searches, setSearches] = useState<Record<Slot, string>>({ 1: '', 2: '' })
  const [selected, setSelected] = useState<Record<Slot, Family | null>>({ 1: null, 2: null })
  const [playerIds, setPlayerIds] = useState<Record<Slot, string>>({ 1: '', 2: '' })
  const [scheduleMode, setScheduleMode] = useState<'one_off' | 'standing'>('one_off')

  function filteredFor(slot: Slot): Family[] {
    const q = searches[slot].trim().toLowerCase()
    if (!q) return []
    return families.filter(f =>
      f.family_name.toLowerCase().includes(q) ||
      f.display_id.toLowerCase().includes(q) ||
      (f.primary_contact?.name ?? '').toLowerCase().includes(q) ||
      f.players.some(p =>
        p.first_name.toLowerCase().includes(q) ||
        p.last_name.toLowerCase().includes(q) ||
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
      )
    ).slice(0, 10)
  }

  function pickFamily(slot: Slot, f: Family) {
    setSelected(prev => ({ ...prev, [slot]: f }))
    setSearches(prev => ({ ...prev, [slot]: '' }))
    setPlayerIds(prev => ({ ...prev, [slot]: f.players.length === 1 ? f.players[0].id : '' }))
  }

  function clearFamily(slot: Slot) {
    setSelected(prev => ({ ...prev, [slot]: null }))
    setPlayerIds(prev => ({ ...prev, [slot]: '' }))
    setSearches(prev => ({ ...prev, [slot]: '' }))
  }

  function resetAll() {
    setSearches({ 1: '', 2: '' })
    setSelected({ 1: null, 2: null })
    setPlayerIds({ 1: '', 2: '' })
    setScheduleMode('one_off')
  }

  if (!showForm) {
    return (
      <Button onClick={() => setShowForm(true)} size="sm" variant="outline">
        Book Shared Private (2 players)
      </Button>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Shared Private Lesson</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          2 players share one session. Cost is split 50/50 between families.
        </p>
        <form action={adminCreateSharedPrivate} className="mt-4 space-y-4">
          <input type="hidden" name="schedule_mode" value={scheduleMode} />

          <div className="grid gap-3 sm:grid-cols-2">
            {([1, 2] as Slot[]).map(slot => {
              const sel = selected[slot]
              const search = searches[slot]
              const filtered = filteredFor(slot)
              return (
                <div key={slot} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold text-muted-foreground">Player {slot}</p>

                  {/* Family search */}
                  <div className="relative">
                    <Label htmlFor={`shared_family_search_${slot}`} className="text-xs">Family</Label>
                    {sel ? (
                      <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <span className="flex-1 truncate">{sel.display_id} - {sel.family_name}</span>
                        <button
                          type="button"
                          onClick={() => clearFamily(slot)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                        <input type="hidden" name={`family_id_${slot}`} value={sel.id} />
                      </div>
                    ) : (
                      <>
                        <div className="relative mt-1">
                          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id={`shared_family_search_${slot}`}
                            value={search}
                            onChange={e => setSearches(prev => ({ ...prev, [slot]: e.target.value }))}
                            placeholder="Search by parent, player, or family..."
                            className="pl-8"
                            autoComplete="off"
                          />
                        </div>
                        {search.trim() && (
                          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-elevated">
                            {filtered.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-muted-foreground">No families found</p>
                            ) : (
                              filtered.map(f => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => pickFamily(slot, f)}
                                  className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
                                >
                                  <span className="font-medium">{f.display_id} - {f.family_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {f.primary_contact?.name ? `${f.primary_contact.name} · ` : ''}
                                    {f.players.map(p => p.first_name).join(', ')}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Player dropdown */}
                  <div>
                    <Label htmlFor={`player_id_${slot}`} className="text-xs">Player</Label>
                    <select
                      id={`player_id_${slot}`}
                      name={`player_id_${slot}`}
                      required
                      value={playerIds[slot]}
                      onChange={e => setPlayerIds(prev => ({ ...prev, [slot]: e.target.value }))}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select player...</option>
                      {(sel?.players ?? []).map(p => (
                        <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/*
              Coach picker. Family 1's grandfathered rate applies to the whole
              session and is split 50/50 across both families per
              `private-pricing-overrides.md`.
            */}
            <div>
              <CoachRateSelect
                id="shared_coach"
                name="coach_id"
                required
                familyId={selected[1]?.id ?? null}
                coaches={coaches}
              />
              {selected[1] && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Family 1 rate applies; cost split 50/50 between both families.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="shared_date" className="text-xs">{scheduleMode === 'standing' ? 'First date' : 'Date'}</Label>
              <Input id="shared_date" name="date" type="date" required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="shared_time" className="text-xs">Start time</Label>
              <div className="mt-1">
                <TimePicker12h id="shared_time" name="start_time" required />
              </div>
            </div>
            <div>
              <Label htmlFor="shared_duration" className="text-xs">Duration</Label>
              <select id="shared_duration" name="duration_minutes" required defaultValue="60" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <Label className="text-xs">Schedule</Label>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <Label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/30 has-[:checked]:border-primary/30 has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="_schedule"
                  value="one_off"
                  checked={scheduleMode === 'one_off'}
                  onChange={() => setScheduleMode('one_off')}
                  className="mt-0.5 size-4 border-border text-primary focus:ring-primary"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">One-off</span>
                  <p className="text-xs text-muted-foreground">Single session.</p>
                </div>
              </Label>
              <Label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/30 has-[:checked]:border-primary/30 has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="_schedule"
                  value="standing"
                  checked={scheduleMode === 'standing'}
                  onChange={() => setScheduleMode('standing')}
                  className="mt-0.5 size-4 border-border text-primary focus:ring-primary"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">Weekly (rest of term)</span>
                  <p className="text-xs text-muted-foreground">Books every week on the same day at the same time until term ends.</p>
                </div>
              </Label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm">
              {scheduleMode === 'standing' ? 'Book Weekly Shared Private' : 'Book Shared Private'}
            </Button>
            {!alwaysExpanded && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); resetAll() }}>Cancel</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
