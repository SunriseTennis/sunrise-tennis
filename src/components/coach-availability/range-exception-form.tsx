'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'

type Mode = 'single' | 'range'

interface Props {
  coachId: string
  onAdd: (formData: FormData) => void
}

export function RangeExceptionForm({ coachId, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('single')
  const [allDay, setAllDay] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setOpen(true)}>
        <Plus className="size-3" />
        Block dates
      </Button>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Block dates</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>

        {/* Mode toggle */}
        <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'single' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Single date
          </button>
          <button
            type="button"
            onClick={() => setMode('range')}
            className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'range' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Date range
          </button>
        </div>

        <form action={onAdd} className="space-y-3">
          <input type="hidden" name="coach_id" value={coachId} />

          {mode === 'single' ? (
            <div>
              <Label htmlFor="single_date" className="text-xs">Date</Label>
              <Input
                id="single_date"
                name="start_date"
                type="date"
                required
                min={today}
                className="mt-1 h-8 text-sm"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="start_date" className="text-xs">From</Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  required
                  min={today}
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="end_date" className="text-xs">To</Label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  required
                  min={today}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* All-day toggle */}
          <Label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/30 has-[:checked]:border-primary/30 has-[:checked]:bg-primary/5">
            <input
              type="checkbox"
              name="all_day"
              checked={allDay}
              onChange={e => setAllDay(e.target.checked)}
              className="size-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-foreground">Block entire day{mode === 'range' ? ' (each day in range)' : ''}</span>
          </Label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="exc_start_time" className="text-xs">From</Label>
                <Input id="exc_start_time" name="start_time" type="time" className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label htmlFor="exc_end_time" className="text-xs">To</Label>
                <Input id="exc_end_time" name="end_time" type="time" className="mt-1 h-8 text-sm" />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="exc_reason" className="text-xs">Reason (optional)</Label>
            <Textarea
              id="exc_reason"
              name="reason"
              className="mt-1 h-14 text-sm"
              placeholder="e.g. School holidays, Doctor appointment"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm">Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
