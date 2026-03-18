'use client'

import { useState } from 'react'
import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'
import { Users, Layers } from 'lucide-react'

// Brand palette colors for players (from the sunrise gradient)
// Used by both player cards and calendar — keep in sync
const PLAYER_PALETTE = [
  'bg-[#2B5EA7] border-[#1F4E97] text-white',       // blue
  'bg-[#E87450] border-[#D06440] text-white',        // coral/orange
  'bg-[#F5B041] border-[#E5A031] text-deep-navy',    // gold
  'bg-[#6480A4] border-[#547094] text-white',         // slate blue
  'bg-[#8B78B0] border-[#7B68A0] text-white',         // purple
]

// Gradient versions for player cards (richer look at larger size)
export const PLAYER_CARD_STYLES = [
  'bg-gradient-to-br from-[#2B5EA7] to-[#4A7EC7] border-[#1F4E97] text-white',
  'bg-gradient-to-br from-[#E87450] to-[#F08A6A] border-[#D06440] text-white',
  'bg-gradient-to-br from-[#F5B041] to-[#F7C56A] border-[#E5A031] text-deep-navy',
  'bg-gradient-to-br from-[#6480A4] to-[#7A96BA] border-[#547094] text-white',
  'bg-gradient-to-br from-[#8B78B0] to-[#A08EC0] border-[#7B68A0] text-white',
]

// Program type colors
const TYPE_COLORS: Record<string, string> = {
  group: 'bg-[#2B5EA7] border-[#1F4E97] text-white',
  squad: 'bg-[#6480A4] border-[#547094] text-white',
  private: 'bg-[#E87450] border-[#D06440] text-white',
  match: 'bg-[#F5B041] border-[#E5A031] text-deep-navy',
  school: 'bg-[#8B78B0] border-[#7B68A0] text-white',
  competition: 'bg-[#F7CD5D] border-[#E7BD4D] text-deep-navy',
}

const DAY_PREFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

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
  programId: string
  programName: string
  programType: string
  programLevel: string | null
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
}

type ColorMode = 'player' | 'type'

export function EnrolledCalendar({
  enrollments,
  playerOrder,
}: {
  enrollments: Enrollment[]
  playerOrder: string[]
}) {
  const [colorMode, setColorMode] = useState<ColorMode>('player')

  // Use the canonical player order (from sorted players array) for consistent colors
  const playerColorMap = new Map<string, string>()
  playerOrder.forEach((name, i) => {
    playerColorMap.set(name, PLAYER_PALETTE[i % PLAYER_PALETTE.length])
  })

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
    const playerNames = group.map(e => e.playerName).filter(Boolean)
    const color = colorMode === 'player'
      ? (playerColorMap.get(playerNames[0] ?? '') ?? PLAYER_PALETTE[0])
      : (TYPE_COLORS[first.programType] ?? TYPE_COLORS.group)

    return {
      id: first.id,
      title: formatCalendarTitle(first.programName, first.programType),
      subtitle: playerNames.join(', '),
      dayOfWeek: first.dayOfWeek!,
      startTime: first.startTime!,
      endTime: first.endTime!,
      color,
      href: `/parent/programs/${first.programId}`,
      programType: first.programType,
      playerNames,
    }
  })

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No scheduled sessions to display.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {/* Color mode toggle */}
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => setColorMode('player')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            colorMode === 'player'
              ? 'bg-[#2B5EA7] text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Users className="size-3" />
          By player
        </button>
        <button
          onClick={() => setColorMode('type')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            colorMode === 'type'
              ? 'bg-[#2B5EA7] text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Layers className="size-3" />
          By type
        </button>
      </div>

      <WeeklyCalendar events={events} />
    </div>
  )
}
