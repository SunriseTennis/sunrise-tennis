'use client'

import { useState, useMemo } from 'react'
import { bulkEnrolPlayers } from '../../actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { UserPlus, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

interface Player {
  id: string
  firstName: string
  lastName: string
  classifications: string[]
}

interface Family {
  id: string
  displayId: string
  familyName: string
  parentName: string | null
  players: Player[]
}

export function BulkEnrolForm({
  programId,
  programLevel,
  families,
  existingPlayerIds,
}: {
  programId: string
  programLevel: string
  families: Family[]
  existingPlayerIds: string[]
}) {
  // Default-open when there are zero enrolled — surfaces the form on a fresh
  // program. Once at least one player is enrolled, defaults closed so the
  // page header + roster stay above the fold.
  const [open, setOpen] = useState(existingPlayerIds.length === 0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [bookingType, setBookingType] = useState('term')
  const [notes, setNotes] = useState('')

  const existingSet = useMemo(() => new Set(existingPlayerIds), [existingPlayerIds])

  // Search across player first/last name, family name + display id, and the
  // primary contact (parent) name. Matches the bulk grandfathered-rate form
  // pattern on /admin/payments — the matched field stays visible in the row.
  const availablePlayers = useMemo(() => {
    const results: (Player & { familyDisplayId: string; familyName: string; parentName: string | null })[] = []
    for (const fam of families) {
      for (const p of fam.players) {
        if (existingSet.has(p.id)) continue
        if (search) {
          const q = search.toLowerCase()
          const match = p.firstName.toLowerCase().includes(q) ||
            p.lastName.toLowerCase().includes(q) ||
            fam.familyName.toLowerCase().includes(q) ||
            fam.displayId.toLowerCase().includes(q) ||
            (fam.parentName?.toLowerCase().includes(q) ?? false)
          if (!match) continue
        }
        results.push({ ...p, familyDisplayId: fam.displayId, familyName: fam.familyName, parentName: fam.parentName })
      }
    }
    return results
  }, [families, existingSet, search])

  // Plan 24 — level-matched = at least one classification matches the program's level.
  const levelMatched = availablePlayers.filter(p => p.classifications.includes(programLevel))
  const others = availablePlayers.filter(p => !p.classifications.includes(programLevel))

  const togglePlayer = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(availablePlayers.map(p => p.id)))
  }

  const clearAll = () => {
    setSelected(new Set())
  }

  const submitLabel = selected.size === 1 ? 'Enrol player' : `Enrol ${selected.size} players`

  return (
    <Card className="overflow-hidden border-border bg-card shadow-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <UserPlus className="size-4 text-primary" />
          Enrol players
          <span className="text-xs font-normal text-muted-foreground">
            (search by family, parent, or player name)
          </span>
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="border-t border-border pt-4 space-y-4">
          {/* Search + booking type */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bulk-search">Search</Label>
              <Input
                id="bulk-search"
                type="text"
                className="mt-1"
                placeholder="Player, parent, family ID or surname..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus={existingPlayerIds.length === 0}
              />
            </div>
            <div>
              <Label htmlFor="bulk-type">Booking type</Label>
              <select id="bulk-type" className={selectClass} value={bookingType} onChange={(e) => setBookingType(e.target.value)}>
                <option value="term">Term enrolment</option>
                <option value="trial">Trial</option>
                <option value="casual">Casual</option>
              </select>
            </div>
          </div>

          {/* Optional notes */}
          <div>
            <Label htmlFor="bulk-notes">Notes (optional)</Label>
            <Input
              id="bulk-notes"
              type="text"
              className="mt-1"
              placeholder="Internal note attached to each booking"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>

          {/* Select all / clear */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selected.size} selected of {availablePlayers.length} available
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} className="text-xs font-medium text-primary hover:underline">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="text-xs font-medium text-muted-foreground hover:underline">
                Clear
              </button>
            </div>
          </div>

          {/* Player list */}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {levelMatched.length > 0 && (
              <>
                <div className="sticky top-0 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
                  Level match ({programLevel})
                </div>
                {levelMatched.map(renderPlayer)}
              </>
            )}
            {others.length > 0 && (
              <>
                {levelMatched.length > 0 && (
                  <div className="sticky top-0 bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    Other levels
                  </div>
                )}
                {others.map(renderPlayer)}
              </>
            )}
            {availablePlayers.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {search ? 'No matching players found' : 'No available players to enrol'}
              </div>
            )}
          </div>

          {/* Submit */}
          <form action={bulkEnrolPlayers}>
            <input type="hidden" name="program_id" value={programId} />
            <input type="hidden" name="player_ids" value={JSON.stringify([...selected])} />
            <input type="hidden" name="booking_type" value={bookingType} />
            <input type="hidden" name="notes" value={notes} />
            <Button type="submit" disabled={selected.size === 0} className="gap-2">
              <UserPlus className="size-4" />
              {submitLabel}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  )

  function renderPlayer(p: Player & { familyDisplayId: string; familyName: string; parentName: string | null }) {
    const isSelected = selected.has(p.id)
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => togglePlayer(p.id)}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/30 transition-colors',
          isSelected && 'bg-primary/5'
        )}
      >
        <div className={cn(
          'flex size-5 items-center justify-center rounded border transition-colors',
          isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
        )}>
          {isSelected && <Check className="size-3" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{p.firstName} {p.lastName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {p.familyDisplayId} {p.familyName}
            {p.parentName ? ` - ${p.parentName}` : ''}
          </div>
        </div>
        {p.classifications.length > 0 && (
          <span className="text-xs capitalize text-muted-foreground">{p.classifications.join(' / ')}</span>
        )}
      </button>
    )
  }
}
