import type { CalendarEvent } from '@/components/weekly-calendar'

export const LEVEL_COLORS: Record<string, string> = {
  red: 'bg-ball-red/30 border-ball-red/50',
  orange: 'bg-ball-orange/30 border-ball-orange/50',
  green: 'bg-ball-green/30 border-ball-green/50',
  yellow: 'bg-ball-yellow/30 border-ball-yellow/50',
  competitive: 'bg-primary/15 border-primary/30',
}

export type SessionData = {
  id: string
  programId: string | null
  date: string
  startTime: string | null
  endTime: string | null
  status: string
  sessionType: string | null
  coachName: string
  venueName: string
  bookedCount: number
  leadCoach: string
  assistantCoaches: string[]
}

export type ProgramInfo = {
  id: string
  name: string
  level: string | null
  max_capacity: number | null
  program_roster: { count: number }[]
}

/**
 * Convert session data into calendar events, filtering out cancelled privates/standalone sessions.
 * Cancelled program sessions stay visible (greyed out via CSS).
 */
export function sessionsToCalendarEvents(
  sessions: SessionData[],
  programs: ProgramInfo[],
  opts?: { hideCancelled?: boolean },
): CalendarEvent[] {
  const programMap = new Map(programs.map(p => [p.id, p]))

  return sessions
    .filter(s => s.startTime && s.endTime && s.date)
    // Hide cancelled privates/standalone sessions entirely
    .filter(s => !(s.status === 'cancelled' && (!s.programId || s.sessionType === 'private')))
    // Optionally hide all cancelled sessions (for overview calendar)
    .filter(s => !opts?.hideCancelled || s.status !== 'cancelled')
    .map(s => {
      const program = s.programId ? programMap.get(s.programId) : null
      const enrolled = program?.program_roster?.[0]?.count ?? 0
      const capacity = program?.max_capacity
      const capacityLabel = capacity ? `${s.bookedCount || enrolled}/${capacity}` : undefined
      let capacityColor: 'green' | 'amber' | 'red' | 'blue' | undefined
      if (capacity) {
        const ratio = (s.bookedCount || enrolled) / capacity
        if (ratio > 1) capacityColor = 'blue'
        else if (ratio >= 1) capacityColor = 'red'
        else if (ratio >= 0.75) capacityColor = 'amber'
        else capacityColor = 'green'
      }

      const eventDate = new Date(s.date + 'T12:00:00')
      const dayOfWeek = eventDate.getDay()

      return {
        id: s.id,
        title: program?.name ?? 'Session',
        subtitle: s.coachName,
        dayOfWeek,
        startTime: s.startTime!,
        endTime: s.endTime!,
        color: LEVEL_COLORS[program?.level ?? ''] ?? 'bg-primary/15 border-primary/30',
        date: s.date,
        sessionId: s.id,
        programId: s.programId ?? undefined,
        sessionStatus: s.status,
        coachName: s.coachName,
        bookedCount: s.bookedCount,
        capacityLabel,
        capacityColor,
        assistantCoaches: s.assistantCoaches,
      } satisfies CalendarEvent
    })
}
