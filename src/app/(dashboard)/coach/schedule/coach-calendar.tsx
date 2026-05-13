'use client'

import { useState } from 'react'
import Link from 'next/link'
import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'
import { StatusBadge } from '@/components/status-badge'
import { Users, X, Eye, ClipboardCheck } from 'lucide-react'
import { InlineAttendance } from './inline-attendance'
import { ManagePrivateSessionModal } from '@/components/admin/manage-private-session-modal'

type Player = { id: string; first_name: string; last_name: string; classifications: string[] | null }

function CoachSessionPopup({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  // Plan `velvety-whistling-boot`: coaches can mark attendance for private
  // sessions directly from the schedule calendar popup. ManagePrivateSessionModal
  // hits the admin-or-coach-authz'd `markPrivateAttendance` server action.
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const isPrivate = event.programType === 'private'
  const isScheduled = (event.sessionStatus ?? 'scheduled') === 'scheduled'

  return (
    <>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground leading-tight">{event.title}</h3>
            {event.sessionStatus && (
              <StatusBadge status={event.sessionStatus} />
            )}
          </div>
          <button
            onClick={onClose}
            className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              event.coachName === 'Lead'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}>
              {event.coachName}
            </span>
          </div>
          {event.bookedCount !== undefined && (
            <div className="flex items-center gap-2">
              <Users className="size-3.5 shrink-0" />
              <span>{event.bookedCount} player{event.bookedCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {event.sessionId && (
            <Link
              href={isPrivate ? `/coach/privates/${event.sessionId}` : `/coach/schedule/${event.sessionId}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110"
            >
              <Eye className="size-3.5" />
              View session
            </Link>
          )}
          {isPrivate && isScheduled && event.sessionId && (
            <button
              type="button"
              onClick={() => setAttendanceOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm font-medium text-success transition-all hover:bg-success/10"
            >
              <ClipboardCheck className="size-3.5" />
              Mark attendance
            </button>
          )}
        </div>
      </div>

      {isPrivate && event.sessionId && (
        <ManagePrivateSessionModal
          open={attendanceOpen}
          onClose={() => setAttendanceOpen(false)}
          sessionId={event.sessionId}
          deepLinkHref={`/coach/privates/${event.sessionId}`}
        />
      )}
    </>
  )
}

export function CoachCalendar({
  sessions,
  programRosters,
  sessionAttendances,
  nextSessionDates,
}: {
  sessions: CalendarEvent[]
  programRosters?: Record<string, Player[]>
  sessionAttendances?: Record<string, Record<string, string>>
  nextSessionDates?: string[]
}) {
  return (
    <WeeklyCalendar
      events={sessions}
      hideNextTerm
      nextJumpDates={nextSessionDates}
      nextJumpLabel="Next session"
      renderPopup={(event, onClose) => (
        <CoachSessionPopup event={event} onClose={onClose} />
      )}
      renderDayEvent={programRosters ? (event) => {
        const roster = event.programId ? (programRosters[event.programId] ?? []) : []
        const attMap = event.sessionId ? (sessionAttendances?.[event.sessionId] ?? {}) : {}
        return (
          <InlineAttendance
            event={event}
            roster={roster}
            attendanceMap={attMap}
          />
        )
      } : undefined}
    />
  )
}
