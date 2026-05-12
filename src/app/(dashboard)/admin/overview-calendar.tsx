'use client'

import { useMemo } from 'react'
import { WeeklyCalendar } from '@/components/weekly-calendar'
import { AdminSessionPopup } from '@/components/admin-session-popup'
import { sessionsToCalendarEvents, type SessionData, type ProgramInfo } from '@/lib/utils/calendar-helpers'

export function OverviewCalendar({
  sessions,
  programs,
}: {
  sessions: SessionData[]
  programs: ProgramInfo[]
}) {
  // Show cancelled program sessions too (greyed-out + line-through in the
  // grid via <WeeklyCalendar>'s sessionStatus styling). Cancelled
  // private/standalone sessions stay filtered upstream in calendar-helpers.
  const events = useMemo(
    () => sessionsToCalendarEvents(sessions, programs),
    [sessions, programs],
  )

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No upcoming sessions this term.
      </p>
    )
  }

  return (
    <WeeklyCalendar
      events={events}
      renderPopup={(event, onClose) => <AdminSessionPopup event={event} onClose={onClose} />}
    />
  )
}
