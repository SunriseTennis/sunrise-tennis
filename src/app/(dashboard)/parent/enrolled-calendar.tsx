'use client'

import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'

const GENDER_COLORS: Record<string, string> = {
  female: 'bg-[#B07E9B]/35 border-[#B07E9B]/50',
  non_binary: 'bg-[#8B78B0]/35 border-[#8B78B0]/50',
  male: 'bg-[#2B5EA7]/30 border-[#2B5EA7]/45',
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
  // Group enrollments by program to merge player names into one event
  const grouped = new Map<string, Enrollment[]>()
  for (const e of enrollments.filter(e => e.dayOfWeek != null && e.startTime && e.endTime)) {
    const key = e.programId
    const existing = grouped.get(key)
    if (existing) existing.push(e)
    else grouped.set(key, [e])
  }

  const events: CalendarEvent[] = Array.from(grouped.values()).map(group => {
    const first = group[0]
    const playerNames = group.map(e => e.playerName).filter(Boolean).join(', ')
    return {
      id: first.id,
      title: formatCalendarTitle(first.programName, first.programType),
      subtitle: playerNames,
      dayOfWeek: first.dayOfWeek!,
      startTime: first.startTime!,
      endTime: first.endTime!,
      color: GENDER_COLORS[first.playerGender ?? ''] ?? GENDER_COLORS.male,
      href: `/parent/programs/${first.programId}`,
    }
  })

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No scheduled sessions to display.
      </p>
    )
  }

  return <WeeklyCalendar events={events} />
}
