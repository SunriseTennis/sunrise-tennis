'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TimePicker12h } from '@/components/ui/time-picker-12h'
import { Search, X } from 'lucide-react'
import { adminBookPrivate } from '../actions'
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

export function AdminBookForm({ families, coaches, alwaysExpanded = false }: Props) {
  const [showForm, setShowForm] = useState(alwaysExpanded)
  const [search, setSearch] = useState('')
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'one_off' | 'standing'>('one_off')

  // Search families by family name, parent name, or player name
  const filtered = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
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
  }, [search, families])

  function handleSelectFamily(f: Family) {
    setSelectedFamily(f)
    setSearch('')
    setSelectedPlayerId(f.players.length === 1 ? f.players[0].id : '')
  }

  function handleClearFamily() {
    setSelectedFamily(null)
    setSelectedPlayerId('')
    setSearch('')
  }

  if (!showForm) {
    return (
      <Button onClick={() => setShowForm(true)} size="sm">
        Book Private on Behalf
      </Button>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Book Private Lesson</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Book a private lesson on behalf of a parent. Auto-confirmed.
        </p>
        <form action={adminBookPrivate} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="schedule_mode" value={scheduleMode} />
          {/* Family search */}
          <div className="relative">
            <Label htmlFor="family_search" className="text-xs">Family</Label>
            {selectedFamily ? (
              <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                <span className="flex-1 truncate">
                  {selectedFamily.display_id} - {selectedFamily.family_name}
                </span>
                <button type="button" onClick={handleClearFamily} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
                <input type="hidden" name="family_id" value={selectedFamily.id} />
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="family_search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by parent, player, or family name..."
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
                          onClick={() => handleSelectFamily(f)}
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
            <Label htmlFor="player_id" className="text-xs">Player</Label>
            <select
              id="player_id"
              name="player_id"
              required
              value={selectedPlayerId}
              onChange={e => setSelectedPlayerId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select player...</option>
              {(selectedFamily?.players ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
              ))}
            </select>
          </div>

          {/* Coach — shows grandfathered rate when the selected family has overrides */}
          <CoachRateSelect
            id="coach_id"
            name="coach_id"
            required
            familyId={selectedFamily?.id ?? null}
            coaches={coaches}
          />



          <div>
            <Label htmlFor="date" className="text-xs">{scheduleMode === 'standing' ? 'First date' : 'Date'}</Label>
            <Input id="date" name="date" type="date" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="start_time" className="text-xs">Start time</Label>
            <div className="mt-1">
              <TimePicker12h id="start_time" name="start_time" required />
            </div>
          </div>
          <div>
            <Label htmlFor="duration" className="text-xs">Duration</Label>
            <select id="duration" name="duration_minutes" required defaultValue="30" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </div>

          <div className="sm:col-span-2">
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

          <div className="sm:col-span-2 flex gap-2">
            <Button type="submit" size="sm">{scheduleMode === 'standing' ? 'Book Weekly' : 'Book & Confirm'}</Button>
            {!alwaysExpanded && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); handleClearFamily() }}>Cancel</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
