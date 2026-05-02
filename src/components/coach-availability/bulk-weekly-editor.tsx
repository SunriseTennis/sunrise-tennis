'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { X, Plus, Clock } from 'lucide-react'
import { formatTime } from '@/lib/utils/dates'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PRESETS: { label: string; days: number[] }[] = [
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [0, 6] },
  { label: 'All days', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Clear', days: [] },
]

interface AvailabilityWindow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

interface DayGroup {
  day: number
  name: string
  windows: AvailabilityWindow[]
}

interface Block {
  start: string
  end: string
}

interface Props {
  windowsByDay: DayGroup[]
  coachId: string
  onApply: (formData: FormData) => void
  onRemoveWindow: (formData: FormData) => void
}

export function BulkWeeklyEditor({ windowsByDay, coachId, onApply, onRemoveWindow }: Props) {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set())
  const [blocks, setBlocks] = useState<Block[]>([{ start: '', end: '' }])

  function toggleDay(day: number) {
    setSelectedDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  function applyPreset(days: number[]) {
    setSelectedDays(new Set(days))
  }

  function addBlock() {
    setBlocks(prev => [...prev, { start: '', end: '' }])
  }

  function removeBlock(i: number) {
    setBlocks(prev => prev.length === 1 ? prev : prev.filter((_, j) => j !== i))
  }

  function updateBlock(i: number, key: 'start' | 'end', value: string) {
    setBlocks(prev => prev.map((b, j) => j === i ? { ...b, [key]: value } : b))
  }

  function resetForm() {
    setSelectedDays(new Set())
    setBlocks([{ start: '', end: '' }])
  }

  const canSubmit = selectedDays.size > 0 && blocks.every(b => b.start && b.end)

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Weekly Availability</h2>
          <p className="text-xs text-muted-foreground">
            Pick days and time blocks — applies in one go.
          </p>
        </div>

        {/* Bulk apply form */}
        <form
          action={onApply}
          onSubmit={() => setTimeout(resetForm, 0)}
          className="space-y-4 px-4 py-4"
        >
          <input type="hidden" name="coach_id" value={coachId} />

          {/* Hidden day inputs */}
          {[...selectedDays].map(d => (
            <input key={d} type="hidden" name="day" value={d} />
          ))}

          {/* Hidden block inputs */}
          {blocks.map((b, i) => (
            <div key={i} className="hidden">
              <input type="hidden" name={`block_start_${i}`} value={b.start} />
              <input type="hidden" name={`block_end_${i}`} value={b.end} />
            </div>
          ))}

          {/* Step 1: Days */}
          <div>
            <Label className="text-xs">1. Pick days</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DAY_NAMES.map((name, i) => {
                const active = selectedDays.has(i)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.days)}
                  className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/30 hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Time blocks */}
          <div>
            <Label className="text-xs">2. Time blocks</Label>
            <div className="mt-2 space-y-2">
              {blocks.map((b, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`bs_${i}`} className="text-[11px] text-muted-foreground">From</Label>
                    <Input
                      id={`bs_${i}`}
                      type="time"
                      value={b.start}
                      onChange={e => updateBlock(i, 'start', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor={`be_${i}`} className="text-[11px] text-muted-foreground">To</Label>
                    <Input
                      id={`be_${i}`}
                      type="time"
                      value={b.end}
                      onChange={e => updateBlock(i, 'end', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => removeBlock(i)}
                    disabled={blocks.length === 1}
                    aria-label="Remove block"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addBlock}
              className="mt-1 h-7 gap-1 text-xs"
            >
              <Plus className="size-3" />
              Add another block
            </Button>
          </div>

          {/* Apply */}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!canSubmit}>
              Apply
            </Button>
            {(selectedDays.size > 0 || blocks.some(b => b.start || b.end)) && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Reset
              </Button>
            )}
          </div>
        </form>

        {/* Existing windows */}
        <div className="border-t border-border">
          <div className="px-4 pt-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Currently set
          </div>
          <div className="divide-y divide-border">
            {windowsByDay.map(({ day, windows }) => (
              <div key={day} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="w-12 shrink-0 text-sm font-medium text-foreground">{DAY_NAMES[day]}</span>
                <div className="flex-1">
                  {windows.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {windows.map(w => (
                        <form key={w.id} action={onRemoveWindow}>
                          <input type="hidden" name="id" value={w.id} />
                          <button
                            type="submit"
                            className="group flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            title="Click to remove"
                          >
                            <Clock className="size-3 text-muted-foreground group-hover:text-red-400" />
                            {formatTime(w.start_time)} – {formatTime(w.end_time)}
                            <X className="size-3 text-muted-foreground group-hover:text-red-500" />
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
