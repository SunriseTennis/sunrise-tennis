'use client'

import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'

export interface PickerPlayer {
  id: string
  firstName: string
  lastName: string
  classifications: string[]
}

export interface PickerFamily {
  id: string
  displayId: string
  familyName: string
  parentName: string | null
  players: PickerPlayer[]
}

/**
 * Shared multi-select player picker. Search across player / family / parent
 * name, chip-toggle rows, optional level-matched grouping, Select all / Clear.
 *
 * Pure controlled component — caller owns `selected` Set and `search` string,
 * and decides what to do with the selection (enrol, walk-in, allowlist, etc).
 */
export function MultiPlayerPicker({
  families,
  programLevel,
  excludePlayerIds,
  selected,
  search,
  onSelectedChange,
  onSearchChange,
  autoFocus,
  emptyMessage,
}: {
  families: PickerFamily[]
  /** When set, players whose `classifications` includes the level are surfaced first under a "Level match" header. */
  programLevel?: string | null
  excludePlayerIds: string[]
  selected: Set<string>
  search: string
  onSelectedChange: (next: Set<string>) => void
  onSearchChange: (next: string) => void
  autoFocus?: boolean
  emptyMessage?: string
}) {
  const excludeSet = useMemo(() => new Set(excludePlayerIds), [excludePlayerIds])

  const availablePlayers = useMemo(() => {
    const results: (PickerPlayer & { familyDisplayId: string; familyName: string; parentName: string | null })[] = []
    const q = search.trim().toLowerCase()
    for (const fam of families) {
      for (const p of fam.players) {
        if (excludeSet.has(p.id)) continue
        if (q) {
          const match =
            p.firstName.toLowerCase().includes(q) ||
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
  }, [families, excludeSet, search])

  const levelMatched = programLevel
    ? availablePlayers.filter(p => p.classifications.includes(programLevel))
    : []
  const others = programLevel
    ? availablePlayers.filter(p => !p.classifications.includes(programLevel))
    : availablePlayers

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedChange(next)
  }

  function selectAll() {
    onSelectedChange(new Set(availablePlayers.map(p => p.id)))
  }

  function clearAll() {
    onSelectedChange(new Set())
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="picker-search">Search</Label>
        <Input
          id="picker-search"
          type="text"
          className="mt-1"
          placeholder="Player, parent, family ID or surname..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          autoFocus={autoFocus}
        />
      </div>

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

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border bg-background/40">
        {programLevel && levelMatched.length > 0 && (
          <>
            <div className="sticky top-0 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              Level match ({programLevel})
            </div>
            {levelMatched.map(renderRow)}
          </>
        )}
        {others.length > 0 && (
          <>
            {programLevel && levelMatched.length > 0 && (
              <div className="sticky top-0 bg-muted/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                Other levels
              </div>
            )}
            {others.map(renderRow)}
          </>
        )}
        {availablePlayers.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {search ? 'No matching players found' : (emptyMessage ?? 'No available players')}
          </div>
        )}
      </div>
    </div>
  )

  function renderRow(p: PickerPlayer & { familyDisplayId: string; familyName: string; parentName: string | null }) {
    const isSelected = selected.has(p.id)
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => toggle(p.id)}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors',
          isSelected && 'bg-primary/5',
        )}
      >
        <div className={cn(
          'flex size-5 items-center justify-center rounded border transition-colors shrink-0',
          isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}>
          {isSelected && <Check className="size-3" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{p.firstName} {p.lastName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {p.familyDisplayId} {p.familyName}
            {p.parentName ? ` · ${p.parentName}` : ''}
          </div>
        </div>
        {p.classifications.length > 0 && (
          <span className="text-xs capitalize text-muted-foreground shrink-0">{p.classifications.join(' / ')}</span>
        )}
      </button>
    )
  }
}
