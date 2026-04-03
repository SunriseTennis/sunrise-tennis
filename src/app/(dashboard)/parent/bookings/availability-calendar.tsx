'use client'

import { useState, useMemo } from 'react'
import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { formatTime } from '@/lib/utils/dates'
import { Calendar, CalendarDays, RefreshCw, X } from 'lucide-react'
import { DurationPills } from './duration-pills'
import { requestPrivateBooking, requestStandingPrivate } from './actions'
import type {
  AvailabilityWindow,
  AvailabilityException,
  BookedSession,
  TimeSlot,
} from '@/lib/utils/private-booking'

// ── Types ─────────────────────────────────────────────────────────────

interface Player {
  id: string
  first_name: string
  last_name: string
  ball_color: string | null
}

interface Coach {
  id: string
  name: string
  is_owner: boolean
  rate_per_hour_cents: number
}

interface AllowedEntry {
  player_id: string
  coach_id: string
  auto_approve: boolean
}

interface ExistingBooking {
  id: string
  player_id: string
  session_id: string | null
  status: string
  approval_status: string | null
  price_cents: number | null
  duration_minutes: number | null
  cancellation_type: string | null
  sessions: {
    date: string
    start_time: string | null
    end_time: string | null
    coach_id: string | null
    status: string
    coaches: { name: string } | null
  } | null
}

interface Props {
  players: Player[]
  coaches: Coach[]
  allowedCoaches: AllowedEntry[]
  coachWindows: (AvailabilityWindow & { coach_id: string })[]
  coachExceptions: (AvailabilityException & { coach_id: string })[]
  bookedSessions: (BookedSession & { coach_id: string })[]
  existingBookings: ExistingBooking[]
  playerMap: Record<string, string>
}

type ActiveTab = 'yours' | string // 'yours' or coach ID
type ViewMode = 'weekly' | 'monthly'

// ── Helpers ───────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTimeShort(time: string): string {
  const parts = time.split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

// Status colors for existing bookings
function getBookingColor(status: string, approvalStatus: string | null, cancellationType: string | null): string {
  if (status === 'cancelled') {
    if (cancellationType === 'parent_24h' || cancellationType === 'parent_late') {
      return 'bg-orange-100 border-orange-300 text-orange-700 opacity-70'
    }
    return 'bg-muted/50 border-border text-muted-foreground opacity-60'
  }
  if (approvalStatus === 'pending') return 'bg-amber-100 border-amber-300 text-amber-800'
  if (approvalStatus === 'declined') return 'bg-red-100 border-red-300 text-red-700 opacity-60'
  return 'bg-emerald-100 border-emerald-300 text-emerald-800'
}

function getBookingLabel(status: string, approvalStatus: string | null, cancellationType: string | null): string {
  if (status === 'cancelled') {
    if (cancellationType === 'parent_24h' || cancellationType === 'parent_late') return 'Cancelled'
    return 'Cancelled by coach'
  }
  if (approvalStatus === 'pending') return 'Pending'
  if (approvalStatus === 'declined') return 'Declined'
  return 'Confirmed'
}

// ── Monthly Calendar ──────────────────────────────────────────────────

function MonthlyCalendar({
  events,
  onDayClick,
}: {
  events: CalendarEvent[]
  onDayClick: (dateStr: string) => void
}) {
  const [monthOffset, setMonthOffset] = useState(0)
  const today = new Date()
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()

  const monthName = viewMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

  // Build calendar grid
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7 // Mon=0
  const totalDays = lastDay.getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Group events by date
  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    if (!ev.date) continue
    const existing = eventsByDate.get(ev.date) ?? []
    existing.push(ev)
    eventsByDate.set(ev.date, existing)
  }

  const todayStr = today.toISOString().split('T')[0]

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* Month navigation */}
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-dawn-cream to-peach-mist/40 px-4 py-2.5">
        <button onClick={() => setMonthOffset(o => o - 1)} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/60 hover:text-foreground">
          <span className="text-sm">&lsaquo;</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{monthName}</span>
          {monthOffset !== 0 && (
            <button onClick={() => setMonthOffset(0)} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20">
              Today
            </button>
          )}
        </div>
        <button onClick={() => setMonthOffset(o => o + 1)} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/60 hover:text-foreground">
          <span className="text-sm">&rsaquo;</span>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="border-b border-r border-border/30 bg-muted/10 p-1" style={{ minHeight: 60 }} />

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = eventsByDate.get(dateStr) ?? []
          const isToday = dateStr === todayStr
          const hasAvailable = dayEvents.some(e => e.selectable)
          const hasBooked = dayEvents.some(e => !e.selectable)

          return (
            <button
              key={i}
              onClick={() => { if (dayEvents.length > 0) onDayClick(dateStr) }}
              disabled={dayEvents.length === 0}
              className={cn(
                'border-b border-r border-border/30 p-1 text-left transition-colors',
                dayEvents.length > 0 ? 'hover:bg-primary/5 cursor-pointer' : 'cursor-default',
                isToday && 'bg-primary/5'
              )}
              style={{ minHeight: 60 }}
            >
              <span className={cn(
                'inline-flex size-6 items-center justify-center rounded-full text-xs',
                isToday ? 'bg-primary text-white font-bold' : 'text-foreground'
              )}>
                {day}
              </span>
              {dayEvents.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {hasAvailable && <span className="size-1.5 rounded-full bg-primary" />}
                  {hasBooked && <span className="size-1.5 rounded-full bg-muted-foreground" />}
                  {dayEvents.length > 2 && (
                    <span className="text-[9px] text-muted-foreground">{dayEvents.length}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export function AvailabilityCalendar({
  players,
  coaches,
  allowedCoaches,
  coachWindows,
  coachExceptions,
  bookedSessions,
  existingBookings,
  playerMap,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('yours')
  const [viewMode, setViewMode] = useState<ViewMode>('weekly')
  const [duration, setDuration] = useState<30 | 60>(30)
  const [bookingPopup, setBookingPopup] = useState<{
    slot: TimeSlot
    coachId: string
  } | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [isStanding, setIsStanding] = useState(false)
  const [isPending, setIsPending] = useState(false)

  // Pre-filter coaches: only those with rates where at least one player can book
  const bookableCoaches = useMemo(() => {
    return coaches.filter(coach => {
      if (coach.rate_per_hour_cents <= 0) return false
      return players.some(player => {
        const entries = allowedCoaches.filter(a => a.player_id === player.id)
        return entries.length === 0 || entries.some(a => a.coach_id === coach.id)
      })
    })
  }, [coaches, players, allowedCoaches])

  const selectedCoach = bookableCoaches.find(c => c.id === activeTab) ?? null

  // Eligible players for the selected coach
  const eligiblePlayers = useMemo(() => {
    if (!selectedCoach) return players
    return players.filter(player => {
      const entries = allowedCoaches.filter(a => a.player_id === player.id)
      return entries.length === 0 || entries.some(a => a.coach_id === selectedCoach.id)
    })
  }, [players, allowedCoaches, selectedCoach])

  // ── "Your Privates" events ──────────────────────────────────────────

  const yourEvents = useMemo((): CalendarEvent[] => {
    return existingBookings
      .filter(b => b.sessions?.date && b.sessions?.start_time && b.sessions?.end_time)
      .map(b => {
        const s = b.sessions!
        const coachName = s.coaches?.name?.split(' ')[0] ?? ''
        const playerName = playerMap[b.player_id]?.split(' ')[0] ?? ''
        const dateObj = new Date(s.date + 'T12:00:00')
        const dayOfWeek = dateObj.getDay()
        const label = getBookingLabel(b.status, b.approval_status, b.cancellation_type)
        const isCancelledByParent = b.status === 'cancelled' &&
          (b.cancellation_type === 'parent_24h' || b.cancellation_type === 'parent_late')

        return {
          id: b.id,
          title: `${playerName} - ${coachName}`,
          subtitle: label,
          dayOfWeek,
          startTime: s.start_time!,
          endTime: s.end_time!,
          date: s.date,
          color: getBookingColor(b.status, b.approval_status, b.cancellation_type),
          // Allow re-booking cancelled-by-parent slots
          selectable: isCancelledByParent,
        }
      })
  }, [existingBookings, playerMap])

  // ── Coach availability events ───────────────────────────────────────

  const coachEvents = useMemo((): CalendarEvent[] => {
    if (!selectedCoach) return []

    const windows = coachWindows.filter(w => w.coach_id === selectedCoach.id)
    const exceptions = coachExceptions.filter(e => e.coach_id === selectedCoach.id)
    const sessions = bookedSessions.filter(s => s.coach_id === selectedCoach.id)

    const today = new Date()
    const calEvents: CalendarEvent[] = []
    let eventId = 0

    for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
      const d = new Date(today)
      d.setDate(d.getDate() + dayOffset)
      const dateStr = d.toISOString().split('T')[0]
      const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay()

      const dayWindows = windows.filter(w => w.day_of_week === dayOfWeek)
      if (!dayWindows.length) continue

      const dayExceptions = exceptions.filter(e => e.exception_date === dateStr)
      const fullDayBlocked = dayExceptions.some(e => !e.start_time && !e.end_time)
      if (fullDayBlocked) continue

      for (const window of dayWindows) {
        const windowStart = timeToMinutes(window.start_time)
        const windowEnd = timeToMinutes(window.end_time)

        for (let slotStart = windowStart; slotStart + duration <= windowEnd; slotStart += 30) {
          const slotEnd = slotStart + duration
          const startTime = minutesToTime(slotStart)
          const endTime = minutesToTime(slotEnd)

          // Check exceptions
          let blocked = false
          for (let sub = slotStart; sub < slotEnd; sub += 30) {
            const subEnd = sub + 30
            if (dayExceptions.some(e => {
              if (!e.start_time || !e.end_time) return false
              return sub < timeToMinutes(e.end_time) && subEnd > timeToMinutes(e.start_time)
            })) { blocked = true; break }
          }
          if (blocked) continue

          // Check booked sessions
          let isBooked = false
          for (let sub = slotStart; sub < slotEnd; sub += 30) {
            const subEnd = sub + 30
            if (sessions.some(s => {
              if (s.date !== dateStr || !s.start_time || !s.end_time) return false
              return sub < timeToMinutes(s.end_time) && subEnd > timeToMinutes(s.start_time)
            })) { isBooked = true; break }
          }

          eventId++
          if (isBooked) {
            calEvents.push({
              id: `booked-${eventId}`,
              title: 'Booked',
              dayOfWeek,
              startTime, endTime,
              date: dateStr,
              color: 'bg-muted/60 border-border text-muted-foreground opacity-60',
            })
          } else {
            calEvents.push({
              id: `avail-${eventId}`,
              title: formatTimeShort(startTime),
              dayOfWeek,
              startTime, endTime,
              date: dateStr,
              color: 'bg-primary/15 border-primary/30 text-primary hover:bg-primary/25',
              selectable: true,
            })
          }

          if (duration === 60) slotStart += 30
        }
      }
    }

    return calEvents
  }, [selectedCoach, coachWindows, coachExceptions, bookedSessions, duration])

  const activeEvents = activeTab === 'yours' ? yourEvents : coachEvents

  // ── Event click handler ─────────────────────────────────────────────

  const handleEventClick = (event: CalendarEvent) => {
    if (!event.selectable || !event.date) return

    if (activeTab === 'yours') {
      // Re-booking a cancelled slot — find the original booking to get coach
      const booking = existingBookings.find(b => b.id === event.id)
      if (booking?.sessions?.coach_id) {
        setBookingPopup({
          slot: { date: event.date, startTime: event.startTime, endTime: event.endTime },
          coachId: booking.sessions.coach_id,
        })
      }
    } else if (selectedCoach) {
      setBookingPopup({
        slot: { date: event.date, startTime: event.startTime, endTime: event.endTime },
        coachId: selectedCoach.id,
      })
    }

    setSelectedPlayerId(null)
    setIsStanding(false)
  }

  // Monthly day click → switch to weekly view at that week
  const handleMonthDayClick = (dateStr: string) => {
    setViewMode('weekly')
  }

  const popupCoach = bookingPopup
    ? bookableCoaches.find(c => c.id === bookingPopup.coachId)
    : null

  const popupPriceCents = popupCoach
    ? Math.round((popupCoach.rate_per_hour_cents * duration) / 60)
    : 0

  const popupEligiblePlayers = useMemo(() => {
    if (!popupCoach) return []
    return players.filter(player => {
      const entries = allowedCoaches.filter(a => a.player_id === player.id)
      return entries.length === 0 || entries.some(a => a.coach_id === popupCoach.id)
    })
  }, [players, allowedCoaches, popupCoach])

  // Auto-select if only one eligible player
  const effectivePlayerId = popupEligiblePlayers.length === 1
    ? popupEligiblePlayers[0].id
    : selectedPlayerId

  const canSubmit = !!effectivePlayerId && !!bookingPopup

  return (
    <div className="space-y-3">
      {/* Tab bar: Your Privates + coach pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => { setActiveTab('yours'); setBookingPopup(null) }}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-all',
            activeTab === 'yours'
              ? 'bg-primary text-white shadow-sm'
              : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          Your Privates
        </button>
        {bookableCoaches.map((coach) => (
          <button
            key={coach.id}
            type="button"
            onClick={() => { setActiveTab(coach.id); setBookingPopup(null) }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all',
              activeTab === coach.id
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {coach.name}
          </button>
        ))}

        {/* Spacer + controls */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Duration toggle (only on coach tabs) */}
          {activeTab !== 'yours' && (
            <DurationPills duration={duration} onChange={(d) => { setDuration(d); setBookingPopup(null) }} />
          )}
          {/* View mode toggle */}
          <div className="flex gap-0.5 rounded-full border border-border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('weekly')}
              className={cn(
                'rounded-full p-1 transition-colors',
                viewMode === 'weekly' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Weekly view"
            >
              <Calendar className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={cn(
                'rounded-full p-1 transition-colors',
                viewMode === 'monthly' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Monthly view"
            >
              <CalendarDays className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Coach pricing info (when on a coach tab) */}
      {selectedCoach && (
        <p className="text-xs text-muted-foreground">
          {selectedCoach.name} — ${(selectedCoach.rate_per_hour_cents / 200).toFixed(0)}/30min · ${(selectedCoach.rate_per_hour_cents / 100).toFixed(0)}/hr
        </p>
      )}

      {/* Calendar */}
      {viewMode === 'weekly' ? (
        <WeeklyCalendar events={activeEvents} onEventClick={handleEventClick} />
      ) : (
        <MonthlyCalendar events={activeEvents} onDayClick={handleMonthDayClick} />
      )}

      {/* Booking popup overlay */}
      {bookingPopup && popupCoach && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md animate-slide-up rounded-t-2xl bg-popover p-5 shadow-elevated sm:rounded-2xl" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-foreground">Book Private Lesson</h3>
              <button
                type="button"
                onClick={() => setBookingPopup(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Summary */}
            <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Coach</span>
                <span className="font-medium">{popupCoach.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {new Date(bookingPopup.slot.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">
                  {formatTime(bookingPopup.slot.startTime)} – {formatTime(minutesToTime(timeToMinutes(bookingPopup.slot.startTime) + duration))}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{duration}min</span>
              </div>
              <div className="border-t border-border pt-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span>Price</span>
                  <span>${(popupPriceCents / 100).toFixed(2)} (incl. GST)</span>
                </div>
              </div>
            </div>

            {/* Player selection */}
            {popupEligiblePlayers.length > 1 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">Who is this lesson for?</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {popupEligiblePlayers.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setSelectedPlayerId(player.id)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-all',
                        effectivePlayerId === player.id
                          ? 'bg-primary text-white shadow-sm'
                          : 'border border-border text-foreground hover:bg-muted/50'
                      )}
                    >
                      {player.first_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Standing booking option */}
            <label className="mt-3 flex items-center gap-2 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-muted/30">
              <input
                type="checkbox"
                checked={isStanding}
                onChange={(e) => setIsStanding(e.target.checked)}
                className="size-3.5 rounded border-border"
              />
              <div>
                <span className="text-xs font-medium">Make this a weekly booking</span>
                <p className="text-[10px] text-muted-foreground">Books every week for the rest of the term</p>
              </div>
            </label>

            {/* Submit */}
            <form action={isStanding ? requestStandingPrivate : requestPrivateBooking} className="mt-3">
              <input type="hidden" name="player_id" value={effectivePlayerId ?? ''} />
              <input type="hidden" name="coach_id" value={bookingPopup.coachId} />
              <input type="hidden" name="date" value={bookingPopup.slot.date} />
              <input type="hidden" name="start_time" value={bookingPopup.slot.startTime} />
              <input type="hidden" name="duration_minutes" value={duration} />
              <Button type="submit" className="w-full" size="sm" disabled={!canSubmit || isPending}>
                {isPending ? 'Submitting...' : isStanding ? 'Book Weekly' : 'Request Booking'}
              </Button>
            </form>

            {canSubmit && (
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                {isPlayerAutoApproved(effectivePlayerId!, bookingPopup.coachId, allowedCoaches)
                  ? 'This booking will be confirmed immediately'
                  : 'Your coach will confirm within 24 hours'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function isPlayerAutoApproved(playerId: string, coachId: string, allowed: AllowedEntry[]): boolean {
  const entry = allowed.find(a => a.player_id === playerId && a.coach_id === coachId)
  return entry?.auto_approve ?? false
}
