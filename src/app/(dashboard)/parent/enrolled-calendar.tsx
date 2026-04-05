'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { WeeklyCalendar, type CalendarEvent, type CalendarPlayer, type EnrolledPlayersMap } from '@/components/weekly-calendar'
import { markSessionAway, cancelSessionBooking } from './programs/actions'
import { cancelPrivateFromOverview } from './overview-actions'
import { Users, Layers } from 'lucide-react'

// Brand palette colors for players (from the sunrise gradient)
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
  let result = name
  const lower = result.toLowerCase()

  for (const prefix of DAY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      result = result.slice(prefix.length + 1)
      break
    }
  }

  result = result.replace(/\s+Ball\b/gi, '')

  const resultLower = result.toLowerCase()
  if (type === 'group' && !resultLower.includes('group')) {
    result = result + ' Group'
  } else if (type === 'squad' && !resultLower.includes('squad')) {
    result = result + ' Squad'
  }

  return result
}

type Enrollment = {
  id: string
  playerId: string
  playerName: string
  programId: string
  programName: string
  programType: string
  programLevel: string | null
}

type SessionData = {
  id: string
  program_id: string | null
  date: string
  start_time: string | null
  end_time: string | null
}

type PrivateBooking = {
  id: string
  playerName: string
  programName: string
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
  date?: string | null
  sessionId?: string | null
  approvalStatus?: string | null
}

type ColorMode = 'player' | 'type'

export function EnrolledCalendar({
  enrollments,
  sessions,
  privateBookings,
  playerOrder,
  familyPlayers,
  onMarkAway,
  onCancelPrivate,
}: {
  enrollments: Enrollment[]
  sessions: SessionData[]
  privateBookings?: PrivateBooking[]
  playerOrder: string[]
  familyPlayers?: CalendarPlayer[]
  onMarkAway?: (sessionId: string, playerId: string) => Promise<{ error?: string }>
  onCancelPrivate?: (bookingId: string) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [colorMode, setColorMode] = useState<ColorMode>('player')
  const [hiddenPlayers, setHiddenPlayers] = useState<Set<string>>(new Set())

  const playerColorMap = new Map<string, string>()
  playerOrder.forEach((name, i) => {
    playerColorMap.set(name, PLAYER_PALETTE[i % PLAYER_PALETTE.length])
  })

  // Build a map of programId → enrollment info (player names, types, etc.)
  const programEnrollments = new Map<string, Enrollment[]>()
  for (const e of enrollments) {
    const existing = programEnrollments.get(e.programId)
    if (existing) existing.push(e)
    else programEnrollments.set(e.programId, [e])
  }

  // Build enrolled players map for booking actions
  const enrolledPlayersMapData: EnrolledPlayersMap = {}
  for (const e of enrollments) {
    const existing = enrolledPlayersMapData[e.programId]
    if (existing) {
      if (!existing.includes(e.playerId)) existing.push(e.playerId)
    } else {
      enrolledPlayersMapData[e.programId] = [e.playerId]
    }
  }

  // Build session-based events
  const sessionEvents: CalendarEvent[] = sessions
    .filter(s => s.start_time && s.end_time && s.program_id)
    .map(s => {
      const enrolmentGroup = programEnrollments.get(s.program_id!) ?? []
      const playerNames = enrolmentGroup.map(e => e.playerName).filter(Boolean)
      const first = enrolmentGroup[0]
      const eventDate = new Date(s.date + 'T12:00:00')
      const dayOfWeek = eventDate.getDay()

      const color = colorMode === 'player'
        ? (playerColorMap.get(playerNames[0] ?? '') ?? PLAYER_PALETTE[0])
        : (TYPE_COLORS[first?.programType ?? 'group'] ?? TYPE_COLORS.group)

      return {
        id: s.id,
        title: formatCalendarTitle(first?.programName ?? '', first?.programType ?? 'group'),
        subtitle: playerNames.join(', '),
        dayOfWeek,
        startTime: s.start_time!,
        endTime: s.end_time!,
        color,
        href: first?.programId ? `/parent/programs/${first.programId}` : undefined,
        programType: first?.programType,
        programId: first?.programId,
        playerNames,
        date: s.date,
        isEnrolled: true,
        sessionId: s.id,
      }
    })

  // Private booking events (still use dayOfWeek if no date)
  const privateEvents: CalendarEvent[] = (privateBookings ?? [])
    .filter(b => b.startTime && b.endTime && (b.dayOfWeek != null || b.date))
    .map(b => {
      const statusLabel = b.approvalStatus === 'pending' ? ' · Pending'
        : b.approvalStatus === 'approved' ? ' · Confirmed'
        : ''
      return {
        id: b.id,
        title: b.programName,
        subtitle: `${b.playerName}${statusLabel}`,
        dayOfWeek: b.dayOfWeek ?? 0,
        startTime: b.startTime!,
        endTime: b.endTime!,
        color: colorMode === 'player'
          ? (playerColorMap.get(b.playerName) ?? PLAYER_PALETTE[0])
          : TYPE_COLORS.private,
        programType: 'private',
        playerNames: [b.playerName],
        date: b.date ?? undefined,
        bookingId: b.id,
        sessionId: b.sessionId ?? undefined,
      }
    })

  const events = [...sessionEvents, ...privateEvents]

  // Filter out events where ALL players are hidden
  const visibleEvents = colorMode === 'player'
    ? events.filter(e => !e.playerNames || !e.playerNames.every(n => hiddenPlayers.has(n)))
    : events

  if (visibleEvents.length === 0 && events.length === 0) {
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

      {/* Player toggle pills — only shown in "By player" mode */}
      {colorMode === 'player' && playerOrder.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {playerOrder.map((name, i) => {
            const hidden = hiddenPlayers.has(name)
            const color = PLAYER_PALETTE[i % PLAYER_PALETTE.length]
            return (
              <button
                key={name}
                onClick={() => {
                  setHiddenPlayers(prev => {
                    const next = new Set(prev)
                    if (next.has(name)) next.delete(name)
                    else next.add(name)
                    return next
                  })
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${color} ${
                  hidden ? 'opacity-30 grayscale' : ''
                }`}
              >
                {name}
              </button>
            )
          })}
        </div>
      )}

      <WeeklyCalendar
        events={visibleEvents}
        players={familyPlayers}
        enrolledPlayersMap={enrolledPlayersMapData}
        hideCapacity
        onMarkAway={async (sid, pid) => {
          const fn = onMarkAway ?? markSessionAway
          const r = await fn(sid, pid)
          router.refresh()
          return r
        }}
        onCancelPrivate={async (bid) => {
          const fn = onCancelPrivate ?? cancelPrivateFromOverview
          const r = await fn(bid)
          router.refresh()
          return r
        }}
        onCancelSession={async (sid, pid) => {
          const r = await cancelSessionBooking(sid, pid)
          router.refresh()
          return r
        }}
      />
    </div>
  )
}
