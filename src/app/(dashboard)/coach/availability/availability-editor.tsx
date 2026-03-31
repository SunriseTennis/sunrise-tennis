'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { X, Plus, Clock } from 'lucide-react'
import { setAvailability, removeAvailability } from '../actions'
import { formatTime } from '@/lib/utils/dates'

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

interface AvailabilityEditorProps {
  windowsByDay: DayGroup[]
  coachId: string
}

export function AvailabilityEditor({ windowsByDay, coachId }: AvailabilityEditorProps) {
  const [addingDay, setAddingDay] = useState<number | null>(null)

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Weekly Availability</h2>
          <p className="text-xs text-muted-foreground">
            Set when you&apos;re available for private lessons each week
          </p>
        </div>

        <div className="divide-y divide-border">
          {windowsByDay.map(({ day, name, windows }) => (
            <div key={day} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{name}</span>
                {addingDay !== day && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddingDay(day)}
                    className="h-7 gap-1 text-xs"
                  >
                    <Plus className="size-3" />
                    Add
                  </Button>
                )}
              </div>

              {windows.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {windows.map((w) => (
                    <form key={w.id} action={removeAvailability.bind(null, w.id)}>
                      <button
                        type="submit"
                        className="group flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
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

              {windows.length === 0 && addingDay !== day && (
                <p className="mt-1 text-xs text-muted-foreground">Not available</p>
              )}

              {addingDay === day && (
                <AddWindowForm
                  day={day}
                  coachId={coachId}
                  onCancel={() => setAddingDay(null)}
                />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function AddWindowForm({
  day,
  coachId,
  onCancel,
}: {
  day: number
  coachId: string
  onCancel: () => void
}) {
  return (
    <form action={setAvailability} className="mt-2 flex items-end gap-2">
      <input type="hidden" name="coach_id" value={coachId} />
      <input type="hidden" name="day_of_week" value={day} />
      <div className="flex-1">
        <Label htmlFor={`start_${day}`} className="text-xs">
          From
        </Label>
        <Input
          id={`start_${day}`}
          name="start_time"
          type="time"
          required
          className="h-8 text-sm"
        />
      </div>
      <div className="flex-1">
        <Label htmlFor={`end_${day}`} className="text-xs">
          To
        </Label>
        <Input
          id={`end_${day}`}
          name="end_time"
          type="time"
          required
          className="h-8 text-sm"
        />
      </div>
      <Button type="submit" size="sm" className="h-8">
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}
