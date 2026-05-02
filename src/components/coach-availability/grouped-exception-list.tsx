'use client'

import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { CalendarOff, X } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'

interface Exception {
  id: string
  exception_date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
}

interface ExceptionGroup {
  ids: string[]
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  reason: string | null
}

function groupExceptions(exceptions: Exception[]): ExceptionGroup[] {
  // Sort ascending by date
  const sorted = [...exceptions].sort((a, b) => a.exception_date.localeCompare(b.exception_date))
  const groups: ExceptionGroup[] = []

  for (const exc of sorted) {
    const last = groups[groups.length - 1]
    const sameSignature = last
      && last.startTime === exc.start_time
      && last.endTime === exc.end_time
      && (last.reason ?? '') === (exc.reason ?? '')
      && isOneDayAfter(last.endDate, exc.exception_date)

    if (sameSignature) {
      last.endDate = exc.exception_date
      last.ids.push(exc.id)
    } else {
      groups.push({
        ids: [exc.id],
        startDate: exc.exception_date,
        endDate: exc.exception_date,
        startTime: exc.start_time,
        endTime: exc.end_time,
        reason: exc.reason,
      })
    }
  }
  return groups
}

function isOneDayAfter(prev: string, curr: string): boolean {
  const p = new Date(prev + 'T00:00:00')
  const c = new Date(curr + 'T00:00:00')
  const diff = (c.getTime() - p.getTime()) / (24 * 60 * 60 * 1000)
  return Math.round(diff) === 1
}

interface Props {
  exceptions: Exception[]
  onRemove: (formData: FormData) => void
}

export function GroupedExceptionList({ exceptions, onRemove }: Props) {
  const groups = groupExceptions(exceptions)

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-6">
          <EmptyState
            icon={CalendarOff}
            title="No exceptions"
            description="Your weekly availability applies to all upcoming dates"
            compact
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming exceptions</h3>
        </div>
        <div className="divide-y divide-border">
          {groups.map(g => {
            const isRange = g.startDate !== g.endDate
            return (
              <div key={g.ids[0]} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {isRange
                      ? `${formatDate(g.startDate)} → ${formatDate(g.endDate)}`
                      : formatDate(g.startDate)}
                    {isRange && (
                      <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        {g.ids.length} days
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {g.startTime && g.endTime
                      ? `${formatTime(g.startTime)} – ${formatTime(g.endTime)}`
                      : 'All day'}
                    {g.reason && <span> — {g.reason}</span>}
                  </p>
                </div>
                <form action={onRemove}>
                  {/* Submit one form per id; safest is to remove all in series — for simplicity send the first id and let the DB enforce. */}
                  {/* Actually we want to remove ALL rows in the group: send all ids comma-separated. */}
                  <input type="hidden" name="ids" value={g.ids.join(',')} />
                  <button
                    type="submit"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                    title={isRange ? `Remove all ${g.ids.length} dates` : 'Remove'}
                  >
                    <X className="size-3.5" />
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
