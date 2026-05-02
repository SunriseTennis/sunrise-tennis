'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TimePicker12h } from '@/components/ui/time-picker-12h'
import { Plus, X, Save, Undo } from 'lucide-react'
import { formatTime } from '@/lib/utils/dates'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Show in Mon..Sun reading order (most common for tennis week)
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface ExistingBlock {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

interface PendingNew {
  /** Local id (uuid-ish) used as React key + to remove the pending insert before save. */
  localId: string
  day: number
  start: string
  end: string
}

interface Props {
  coachId: string
  existingBlocks: ExistingBlock[]
  /** Server action (formData → void). FormData carries: coach_id, deletes (CSV), inserts (JSON). */
  onSave: (formData: FormData) => void
}

function newLocalId() {
  return `new_${Math.random().toString(36).slice(2, 10)}`
}

export function EditModeAvailabilityEditor({ coachId, existingBlocks, onSave }: Props) {
  // Server-truth list. Reset whenever the prop changes (e.g. after a save).
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<PendingNew[]>([])

  // Per-day "add block" form state
  const [addingForDay, setAddingForDay] = useState<number | null>(null)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')

  // Reset staged changes when the underlying server data changes (after a save).
  // React-recommended pattern: compare prev prop in render and call setState during render.
  const [prevBlocks, setPrevBlocks] = useState(existingBlocks)
  if (prevBlocks !== existingBlocks) {
    setPrevBlocks(existingBlocks)
    setDeletedIds(new Set())
    setPending([])
    setAddingForDay(null)
  }

  const blocksByDay = useMemo(() => {
    const out: Record<number, { id?: string; localId?: string; start: string; end: string; pendingDelete: boolean; pendingNew: boolean }[]> = {}
    for (let d = 0; d <= 6; d++) out[d] = []
    for (const b of existingBlocks) {
      out[b.day_of_week].push({
        id: b.id,
        start: b.start_time.slice(0, 5),
        end: b.end_time.slice(0, 5),
        pendingDelete: deletedIds.has(b.id),
        pendingNew: false,
      })
    }
    for (const p of pending) {
      out[p.day].push({
        localId: p.localId,
        start: p.start,
        end: p.end,
        pendingDelete: false,
        pendingNew: true,
      })
    }
    // Sort each day by start time
    for (const d of Object.keys(out)) {
      out[Number(d)].sort((a, b) => a.start.localeCompare(b.start))
    }
    return out
  }, [existingBlocks, deletedIds, pending])

  const dirty = deletedIds.size > 0 || pending.length > 0

  function toggleDelete(id: string) {
    setDeletedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function removePending(localId: string) {
    setPending(prev => prev.filter(p => p.localId !== localId))
  }

  function addPending(day: number, start: string, end: string) {
    setPending(prev => [...prev, { localId: newLocalId(), day, start, end }])
    setAddingForDay(null)
    setDraftStart('')
    setDraftEnd('')
  }

  function discardAll() {
    setDeletedIds(new Set())
    setPending([])
    setAddingForDay(null)
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Weekly Availability</h2>
            <p className="text-xs text-muted-foreground">
              Add or remove blocks per day. Changes are staged until you save.
            </p>
          </div>
          {dirty && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {deletedIds.size > 0 && `${deletedIds.size} to remove`}
                {deletedIds.size > 0 && pending.length > 0 && ' · '}
                {pending.length > 0 && `${pending.length} to add`}
              </span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={discardAll}>
                <Undo className="size-3" />
                Discard
              </Button>
              <form action={onSave}>
                {/* Hidden inputs serialize the staged changes. */}
                <input type="hidden" name="coach_id" value={coachId} />
                <input type="hidden" name="deletes" value={[...deletedIds].join(',')} />
                <input
                  type="hidden"
                  name="inserts"
                  value={JSON.stringify(pending.map(p => ({ day: p.day, start: p.start, end: p.end })))}
                />
                <Button type="submit" size="sm" className="h-7 gap-1 text-xs">
                  <Save className="size-3" />
                  Save changes
                </Button>
              </form>
            </div>
          )}
        </div>

        <div className="divide-y divide-border">
          {DISPLAY_ORDER.map(day => {
            const blocks = blocksByDay[day]
            return (
              <div key={day} className="flex items-start gap-3 px-4 py-3">
                <span className="w-10 shrink-0 pt-1 text-sm font-medium text-foreground">{DAY_NAMES[day]}</span>
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {blocks.length === 0 && addingForDay !== day && (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  {blocks.map(b => {
                    if (b.pendingDelete) {
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => b.id && toggleDelete(b.id)}
                          className="rounded-full border border-red-200 bg-red-50/60 px-2.5 py-0.5 text-xs text-red-700 line-through hover:bg-red-100"
                          title="Click to undo removal"
                        >
                          {formatTime(b.start)} – {formatTime(b.end)}
                        </button>
                      )
                    }
                    if (b.pendingNew) {
                      return (
                        <span
                          key={b.localId}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-800"
                        >
                          <span className="font-medium">+</span>
                          {formatTime(b.start)} – {formatTime(b.end)}
                          <button
                            type="button"
                            onClick={() => b.localId && removePending(b.localId)}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-100"
                            title="Remove pending"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      )
                    }
                    return (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-foreground"
                      >
                        {formatTime(b.start)} – {formatTime(b.end)}
                        <button
                          type="button"
                          onClick={() => b.id && toggleDelete(b.id)}
                          className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          title="Mark for removal"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    )
                  })}

                  {addingForDay === day ? (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 p-1 pl-2.5">
                      <span className="text-xs text-emerald-800">From</span>
                      <TimePicker12h
                        name={`__draft_start_${day}`}
                        value={draftStart}
                        onChange={setDraftStart}
                        variant="compact"
                      />
                      <span className="text-xs text-emerald-800">to</span>
                      <TimePicker12h
                        name={`__draft_end_${day}`}
                        value={draftEnd}
                        onChange={setDraftEnd}
                        variant="compact"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!draftStart || !draftEnd) return
                          if (draftEnd <= draftStart) return
                          addPending(day, draftStart, draftEnd)
                        }}
                        disabled={!draftStart || !draftEnd || draftEnd <= draftStart}
                        className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddingForDay(null); setDraftStart(''); setDraftEnd('') }}
                        className="rounded-full p-1 text-emerald-800 hover:bg-emerald-100"
                        title="Cancel"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setAddingForDay(day); setDraftStart('16:00'); setDraftEnd('19:00') }}
                      className="h-7 gap-1 text-xs"
                    >
                      <Plus className="size-3" />
                      Add block
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {!dirty && (
          <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            No pending changes.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
