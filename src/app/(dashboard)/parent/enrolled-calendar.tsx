'use client'

import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'

const GENDER_COLORS: Record<string, string> = {
  female: 'bg-[#B07E9B]/20 border-[#B07E9B]/35',
  non_binary: 'bg-[#8B78B0]/20 border-[#8B78B0]/35',
  male: 'bg-[#2B5EA7]/15 border-[#2B5EA7]/30',
}

const DAY_PREFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Strip day prefix from program name (e.g. "Mon Red Ball" → "Red Ball") and append type */
function formatCalendarTitle(name: string, type: string): string {
  const lower = name.toLowerCase()
  for (const prefix of DAY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      const stripped = name.slice(prefix.length + 1)
      const suffix = type === 'group' ? ' Group' : type === 'squad' ? ' Squad' : ''
      return stripped + suffix
    }
  }
  return name
}

type Enrollment = {
  id: string
  playerName: string
  playerGender: string | null
  programId: string
  programName: string
  programType: string
  programLevel: string | null
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
}

export function EnrolledCalendar({ enrollments }: { enrollments: Enrollment[] }) {
  const events: CalendarEvent[] = enrollments
    .filter(e => e.dayOfWeek != null && e.startTime && e.endTime)
    .map(e => ({
      id: e.id,
      title: formatCalendarTitle(e.programName, e.programType),
      subtitle: e.playerName,
      dayOfWeek: e.dayOfWeek!,
      startTime: e.startTime!,
      endTime: e.endTime!,
      color: GENDER_COLORS[e.playerGender ?? ''] ?? GENDER_COLORS.male,
      href: `/parent/programs/${e.programId}`,
    }))

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No scheduled sessions to display.
      </p>
    )
  }

  return <WeeklyCalendar events={events} />
}
