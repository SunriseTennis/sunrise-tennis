'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { X, Plus, CalendarOff } from 'lucide-react'
import { addException, removeException, updatePayPeriod } from '../actions'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { EmptyState } from '@/components/empty-state'

interface Exception {
  id: string
  exception_date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
}

interface ExceptionListProps {
  exceptions: Exception[]
  coachId: string
  payPeriod: string
}

export function ExceptionList({ exceptions, coachId, payPeriod }: ExceptionListProps) {
  const [showAddForm, setShowAddForm] = useState(false)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Exceptions</h2>
              <p className="text-xs text-muted-foreground">
                Block specific dates
              </p>
            </div>
            {!showAddForm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="size-3" />
                Add
              </Button>
            )}
          </div>

          {showAddForm && (
            <div className="border-b border-border px-4 py-3">
              <form action={addException} className="space-y-3">
                <input type="hidden" name="coach_id" value={coachId} />
                <div>
                  <Label htmlFor="exception_date" className="text-xs">Date</Label>
                  <Input
                    id="exception_date"
                    name="exception_date"
                    type="date"
                    required
                    className="h-8 text-sm"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="exc_start" className="text-xs">From (optional)</Label>
                    <Input
                      id="exc_start"
                      name="start_time"
                      type="time"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="exc_end" className="text-xs">To (optional)</Label>
                    <Input
                      id="exc_end"
                      name="end_time"
                      type="time"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave times empty to block the entire day
                </p>
                <div>
                  <Label htmlFor="exc_reason" className="text-xs">Reason (optional)</Label>
                  <Textarea
                    id="exc_reason"
                    name="reason"
                    className="h-16 text-sm"
                    placeholder="e.g. Doctor appointment"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="h-8">Add Exception</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div className="divide-y divide-border">
            {exceptions.length === 0 && (
              <div className="px-4 py-6">
                <EmptyState
                  icon={CalendarOff}
                  title="No exceptions"
                  description="Your weekly availability applies to all upcoming dates"
                  compact
                />
              </div>
            )}
            {exceptions.map((exc) => (
              <div key={exc.id} className="flex items-start justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(exc.exception_date)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {exc.start_time && exc.end_time
                      ? `${formatTime(exc.start_time)} – ${formatTime(exc.end_time)}`
                      : 'All day'}
                    {exc.reason && ` — ${exc.reason}`}
                  </p>
                </div>
                <form action={removeException.bind(null, exc.id)}>
                  <button
                    type="submit"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Remove exception"
                  >
                    <X className="size-3.5" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pay Period Preference */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-foreground">Pay Period</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How often you prefer to be paid
          </p>
          <form action={updatePayPeriod} className="mt-3 flex items-center gap-2">
            <select
              name="pay_period"
              defaultValue={payPeriod}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="weekly">Weekly</option>
              <option value="end_of_term">End of term</option>
            </select>
            <Button type="submit" size="sm" variant="outline" className="h-8">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
