'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils/cn'
import { BookOpen, ExternalLink, ChevronDown, History } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'

interface LessonNote {
  id: string
  session_id: string
  player_id: string
  focus: string | null
  progress: string | null
  notes: string | null
  next_plan: string | null
  drills_used: string[] | null
  video_url: string | null
  created_at: string | null
}

interface PastBooking {
  id: string
  player_id: string
  session_id: string | null
  price_cents: number | null
  duration_minutes: number | null
  sessions: {
    date: string
    start_time: string | null
    end_time: string | null
    coach_id: string | null
    coaches: { name: string } | null
  } | null
}

interface Player {
  id: string
  first_name: string
  last_name: string
}

interface Props {
  pastBookings: PastBooking[]
  lessonNotes: LessonNote[]
  players: Player[]
}

const PLAYER_ACCENTS = [
  'border-l-[#2B5EA7]',
  'border-l-[#E87450]',
  'border-l-[#F5B041]',
  'border-l-[#6480A4]',
  'border-l-[#8B78B0]',
]

export function LessonHistory({ pastBookings, lessonNotes, players }: Props) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())

  // Build note lookup: session_id:player_id → LessonNote
  const noteMap = useMemo(() => {
    const map = new Map<string, LessonNote>()
    for (const note of lessonNotes) {
      map.set(`${note.session_id}:${note.player_id}`, note)
    }
    return map
  }, [lessonNotes])

  // Filter by player
  const filtered = useMemo(() => {
    const sorted = [...pastBookings].sort((a, b) => {
      const dateA = a.sessions?.date ?? ''
      const dateB = b.sessions?.date ?? ''
      return dateB.localeCompare(dateA)
    })
    if (!selectedPlayerId) return sorted
    return sorted.filter(b => b.player_id === selectedPlayerId)
  }, [pastBookings, selectedPlayerId])

  const displayed = showAll ? filtered : filtered.slice(0, 3)
  const hasMore = filtered.length > 3

  if (pastBookings.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Lesson History</h2>
        <EmptyState
          icon={History}
          title="No past lessons"
          description="Completed private lessons will appear here"
          compact
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Lesson History</h2>

      {/* Player toggle pills */}
      {players.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedPlayerId(null)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all',
              !selectedPlayerId
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {players.map((player, i) => (
            <button
              key={player.id}
              type="button"
              onClick={() => setSelectedPlayerId(selectedPlayerId === player.id ? null : player.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                selectedPlayerId === player.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {player.first_name}
            </button>
          ))}
        </div>
      )}

      {/* Lesson cards */}
      <div className="space-y-2">
        {displayed.map((booking) => {
          const session = booking.sessions
          const coachName = session?.coaches?.name?.split(' ')[0] ?? 'Unknown'
          const player = players.find(p => p.id === booking.player_id)
          const playerIndex = players.findIndex(p => p.id === booking.player_id)
          const accentClass = PLAYER_ACCENTS[playerIndex % PLAYER_ACCENTS.length]
          const note = booking.session_id
            ? noteMap.get(`${booking.session_id}:${booking.player_id}`)
            : undefined
          const isExpanded = expandedNotes.has(booking.id)

          return (
            <Card key={booking.id} className={cn('overflow-hidden rounded-xl shadow-card border-l-4', accentClass)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {player?.first_name ?? 'Unknown'}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        with {coachName}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {session ? `${formatDate(session.date)} · ${session.start_time ? formatTime(session.start_time) : ''} · ${booking.duration_minutes}min` : 'Details unavailable'}
                    </p>
                  </div>
                </div>

                {/* Lesson note preview */}
                {note ? (
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {note.focus && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {note.focus}
                        </span>
                      )}
                      {note.video_url && (
                        <a
                          href={note.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/20"
                        >
                          <ExternalLink className="size-3" />
                          Video
                        </a>
                      )}
                    </div>

                    {(note.progress || note.notes) && (
                      <>
                        {!isExpanded ? (
                          <button
                            type="button"
                            onClick={() => setExpandedNotes(prev => new Set([...prev, booking.id]))}
                            className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <BookOpen className="size-3" />
                            View notes
                            <ChevronDown className="size-3" />
                          </button>
                        ) : (
                          <div className="mt-2 space-y-1.5 rounded-lg bg-muted/30 p-3 text-xs">
                            {note.progress && (
                              <div>
                                <span className="font-medium text-foreground">Progress: </span>
                                <span className="text-muted-foreground">{note.progress}</span>
                              </div>
                            )}
                            {note.notes && (
                              <div>
                                <span className="font-medium text-foreground">Notes: </span>
                                <span className="text-muted-foreground">{note.notes}</span>
                              </div>
                            )}
                            {note.next_plan && (
                              <div>
                                <span className="font-medium text-foreground">Next: </span>
                                <span className="text-muted-foreground">{note.next_plan}</span>
                              </div>
                            )}
                            {note.drills_used && note.drills_used.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {note.drills_used.map((drill, i) => (
                                  <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {drill}
                                  </span>
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedNotes(prev => {
                                const next = new Set(prev)
                                next.delete(booking.id)
                                return next
                              })}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Collapse
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground/60">No notes yet</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Show all / show less toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full rounded-lg border border-border py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
        >
          {showAll ? 'Show less' : `Show all ${filtered.length} lessons`}
        </button>
      )}
    </div>
  )
}
