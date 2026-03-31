'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { X, Plus, Clock, CalendarOff } from 'lucide-react'
import {
  adminSetCoachAvailability,
  adminRemoveAvailability,
  adminAddException,
  adminRemoveException,
} from '../actions'
import { formatTime, formatDate } from '@/lib/utils/dates'
import { EmptyState } from '@/components/empty-state'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Coach {
  id: string
  name: string
  is_owner: boolean | null
}

interface Window {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

interface Exception {
  id: string
  exception_date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
}

interface Props {
  coaches: Coach[]
  selectedCoachId: string | null
  windows: Window[] | null
  exceptions: Exception[] | null
}

export function AdminAvailabilityManager({ coaches, selectedCoachId, windows, exceptions }: Props) {
  const router = useRouter()
  const [addingDay, setAddingDay] = useState<number | null>(null)
  const [showExceptionForm, setShowExceptionForm] = useState(false)
  const selectedCoach = coaches.find(c => c.id === selectedCoachId)

  const windowsByDay = DAY_NAMES.map((name, i) => ({
    day: i,
    name,
    windows: (windows ?? []).filter(w => w.day_of_week === i),
  }))

  return (
    <div className="space-y-6">
      {/* Coach selector */}
      <div className="flex flex-wrap gap-2">
        {coaches.map((coach) => (
          <Button
            key={coach.id}
            variant={selectedCoachId === coach.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => router.push(`/admin/privates/availability?coach_id=${coach.id}`)}
          >
            {coach.name}
          </Button>
        ))}
      </div>

      {!selectedCoach && (
        <EmptyState
          icon={Clock}
          title="Select a coach"
          description="Choose a coach above to manage their availability"
        />
      )}

      {selectedCoach && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Weekly windows */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-0">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    {selectedCoach.name}&apos;s Weekly Availability
                  </h2>
                </div>
                <div className="divide-y divide-border">
                  {windowsByDay.map(({ day, name, windows: dayWindows }) => (
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
                      {dayWindows.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {dayWindows.map((w) => (
                            <form key={w.id} action={adminRemoveAvailability.bind(null, w.id)}>
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
                      {dayWindows.length === 0 && addingDay !== day && (
                        <p className="mt-1 text-xs text-muted-foreground">Not available</p>
                      )}
                      {addingDay === day && (
                        <form action={adminSetCoachAvailability} className="mt-2 flex items-end gap-2">
                          <input type="hidden" name="coach_id" value={selectedCoach.id} />
                          <input type="hidden" name="day_of_week" value={day} />
                          <div className="flex-1">
                            <Label htmlFor={`start_${day}`} className="text-xs">From</Label>
                            <Input id={`start_${day}`} name="start_time" type="time" required className="h-8 text-sm" />
                          </div>
                          <div className="flex-1">
                            <Label htmlFor={`end_${day}`} className="text-xs">To</Label>
                            <Input id={`end_${day}`} name="end_time" type="time" required className="h-8 text-sm" />
                          </div>
                          <Button type="submit" size="sm" className="h-8">Add</Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAddingDay(null)}>Cancel</Button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Exceptions */}
          <div>
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">Exceptions</h2>
                  {!showExceptionForm && (
                    <Button variant="ghost" size="sm" onClick={() => setShowExceptionForm(true)} className="h-7 gap-1 text-xs">
                      <Plus className="size-3" />
                      Add
                    </Button>
                  )}
                </div>

                {showExceptionForm && (
                  <div className="border-b border-border px-4 py-3">
                    <form action={adminAddException} className="space-y-3">
                      <input type="hidden" name="coach_id" value={selectedCoach.id} />
                      <div>
                        <Label htmlFor="exc_date" className="text-xs">Date</Label>
                        <Input id="exc_date" name="exception_date" type="date" required className="h-8 text-sm" min={new Date().toISOString().split('T')[0]} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="exc_s" className="text-xs">From</Label>
                          <Input id="exc_s" name="start_time" type="time" className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label htmlFor="exc_e" className="text-xs">To</Label>
                          <Input id="exc_e" name="end_time" type="time" className="h-8 text-sm" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="exc_r" className="text-xs">Reason</Label>
                        <Textarea id="exc_r" name="reason" className="h-16 text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" className="h-8">Add</Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setShowExceptionForm(false)}>Cancel</Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="divide-y divide-border">
                  {(exceptions ?? []).length === 0 && (
                    <div className="px-4 py-6">
                      <EmptyState icon={CalendarOff} title="No exceptions" description="Weekly schedule applies to all dates" compact />
                    </div>
                  )}
                  {(exceptions ?? []).map((exc) => (
                    <div key={exc.id} className="flex items-start justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{formatDate(exc.exception_date)}</p>
                        <p className="text-xs text-muted-foreground">
                          {exc.start_time && exc.end_time ? `${formatTime(exc.start_time)} – ${formatTime(exc.end_time)}` : 'All day'}
                          {exc.reason && ` — ${exc.reason}`}
                        </p>
                      </div>
                      <form action={adminRemoveException.bind(null, exc.id)}>
                        <button type="submit" className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600">
                          <X className="size-3.5" />
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
