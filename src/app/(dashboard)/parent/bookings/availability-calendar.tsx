'use client'

import { useState, useMemo, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { formatTime } from '@/lib/utils/dates'
import { Calendar, CalendarDays, List, X, Loader2 } from 'lucide-react'
import { DurationPills } from './duration-pills'
import { requestPrivateBooking, requestStandingPrivate, cancelPrivateBooking } from './actions'
import { getStandingDates } from '@/lib/utils/private-booking'
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
  rangeEndDate: string // YYYY-MM-DD — end of term or fallback
}

type ActiveTab = 'yours' | 'availabilities'
type ViewMode = 'week' | 'day' | 'month'

// ── Coach color palette ───────────────────────────────────────────────

const COACH_COLORS = [
  { bg: 'bg-[#2B5EA7]/15 border-[#2B5EA7]/30 text-[#2B5EA7]', hover: 'hover:bg-[#2B5EA7]/25' },
  { bg: 'bg-[#E87450]/15 border-[#E87450]/30 text-[#E87450]', hover: 'hover:bg-[#E87450]/25' },
  { bg: 'bg-[#8B78B0]/15 border-[#8B78B0]/30 text-[#8B78B0]', hover: 'hover:bg-[#8B78B0]/25' },
  { bg: 'bg-[#F5B041]/15 border-[#F5B041]/30 text-[#9A6E1F]', hover: 'hover:bg-[#F5B041]/25' },
  { bg: 'bg-[#6480A4]/15 border-[#6480A4]/30 text-[#6480A4]', hover: 'hover:bg-[#6480A4]/25' },
]

const COACH_BOOKED_COLORS = [
  'bg-[#2B5EA7]/8 border-[#2B5EA7]/20 text-[#2B5EA7]/50 opacity-60',
  'bg-[#E87450]/8 border-[#E87450]/20 text-[#E87450]/50 opacity-60',
  'bg-[#8B78B0]/8 border-[#8B78B0]/20 text-[#8B78B0]/50 opacity-60',
  'bg-[#F5B041]/8 border-[#F5B041]/20 text-[#9A6E1F]/50 opacity-60',
  'bg-[#6480A4]/8 border-[#6480A4]/20 text-[#6480A4]/50 opacity-60',
]

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

function getBookingColor(status: string, approvalStatus: string | null, cancellationType: string | null): string {
  if (status === 'cancelled') {
    if (cancellationType === 'parent_24h' || cancellationType === 'parent_late') return 'bg-orange-100 border-orange-300 text-orange-700 opacity-70'
    return 'bg-muted/50 border-border text-muted-foreground opacity-60'
  }
  if (approvalStatus === 'pending') return 'bg-amber-100 border-amber-300 text-amber-800'
  if (approvalStatus === 'declined') return 'bg-red-100 border-red-300 text-red-700 opacity-60'
  return 'bg-emerald-100 border-emerald-300 text-emerald-800'
}

function getBookingLabel(status: string, approvalStatus: string | null, cancellationType: string | null): string {
  if (status === 'cancelled') {
    if (cancellationType === 'parent_24h' || cancellationType === 'parent_late') return 'Cancelled by you'
    return 'Cancelled by coach'
  }
  if (approvalStatus === 'pending') return 'Pending'
  if (approvalStatus === 'declined') return 'Declined'
  return 'Confirmed'
}

// ── Submit button with loading state (prevents double-submit) ─────────

function SubmitButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" size="sm" disabled={disabled || pending}>
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" />
          Submitting...
        </span>
      ) : children}
    </Button>
  )
}

function CancelButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" size="sm" className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" disabled={pending}>
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" />
          Cancelling...
        </span>
      ) : 'Cancel this lesson'}
    </Button>
  )
}

// ── Coach availability event generation ───────────────────────────────

function generateCoachAvailabilityEvents(
  coachId: string,
  coachName: string,
  windows: AvailabilityWindow[],
  exceptions: AvailabilityException[],
  sessions: BookedSession[],
  duration: number,
  idPrefix: string,
  colorIdx: number,
  endDateStr: string,
  ownBookings?: ExistingBooking[],
): CalendarEvent[] {
  const today = new Date()
  const endDate = new Date(endDateStr + 'T23:59:59')
  const calEvents: CalendarEvent[] = []
  let eventId = 0
  const availColor = COACH_COLORS[colorIdx % COACH_COLORS.length]
  const bookedColor = COACH_BOOKED_COLORS[colorIdx % COACH_BOOKED_COLORS.length]

  // Generate day by day until endDate
  const cursor = new Date(today)
  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().split('T')[0]
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay()

    const dayWindows = windows.filter(w => w.day_of_week === dayOfWeek)
    if (dayWindows.length > 0) {
      const dayExceptions = exceptions.filter(e => e.exception_date === dateStr)
      const fullDayBlocked = dayExceptions.some(e => !e.start_time && !e.end_time)

      if (!fullDayBlocked) {
        for (const window of dayWindows) {
          const windowStart = timeToMinutes(window.start_time)
          const windowEnd = timeToMinutes(window.end_time)

          for (let slotStart = windowStart; slotStart + duration <= windowEnd; slotStart += 30) {
            const slotEnd = slotStart + duration
            const startTime = minutesToTime(slotStart)
            const endTime = minutesToTime(slotEnd)

            let blocked = false
            for (let sub = slotStart; sub < slotEnd; sub += 30) {
              const subEnd = sub + 30
              if (dayExceptions.some(e => {
                if (!e.start_time || !e.end_time) return false
                return sub < timeToMinutes(e.end_time) && subEnd > timeToMinutes(e.start_time)
              })) { blocked = true; break }
            }
            if (blocked) continue

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
              // Check if this is the family's own booking
              const ownBooking = ownBookings?.find(b =>
                b.sessions?.coach_id === coachId &&
                b.sessions?.date === dateStr &&
                b.sessions?.start_time === startTime &&
                b.status !== 'cancelled'
              )
              if (ownBooking) {
                const playerName = ownBooking.player_id // Will be resolved by event click
                const label = ownBooking.approval_status === 'pending' ? 'Pending' : 'Confirmed'
                calEvents.push({
                  id: `own-${ownBooking.id}`,
                  title: `Private w/ ${coachName}`,
                  subtitle: label,
                  dayOfWeek, startTime, endTime,
                  date: dateStr,
                  color: `${availColor.bg} ${availColor.hover}`,
                  selectable: true,
                })
              } else {
                calEvents.push({
                  id: `${idPrefix}-booked-${eventId}`,
                  title: 'Booked',
                  subtitle: coachName,
                  dayOfWeek, startTime, endTime,
                  date: dateStr,
                  color: bookedColor,
                })
              }
            } else {
              calEvents.push({
                id: `${idPrefix}-avail-${eventId}`,
                title: formatTimeShort(startTime),
                subtitle: coachName,
                dayOfWeek, startTime, endTime,
                date: dateStr,
                color: `${availColor.bg} ${availColor.hover}`,
                selectable: true,
              })
            }

            if (duration === 60) slotStart += 30
          }
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return calEvents
}

// ── Monthly Calendar ──────────────────────────────────────────────────

function MonthlyCalendar({ events, onDayClick }: { events: CalendarEvent[]; onDayClick: (dateStr: string) => void }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const today = new Date()
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const monthName = viewMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const totalDays = lastDay.getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

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
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-dawn-cream to-peach-mist/40 px-4 py-2.5">
        <button onClick={() => setMonthOffset(o => o - 1)} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/60 hover:text-foreground"><span className="text-sm">&lsaquo;</span></button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{monthName}</span>
          {monthOffset !== 0 && <button onClick={() => setMonthOffset(0)} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20">Today</button>}
        </div>
        <button onClick={() => setMonthOffset(o => o + 1)} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/60 hover:text-foreground"><span className="text-sm">&rsaquo;</span></button>
      </div>
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="border-b border-r border-border/30 bg-muted/10 p-1" style={{ minHeight: 56 }} />
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
              style={{ minHeight: 56 }}
            >
              <span className={cn('inline-flex size-5 items-center justify-center rounded-full text-[11px]', isToday ? 'bg-primary text-white font-bold' : 'text-foreground')}>{day}</span>
              {dayEvents.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {hasAvailable && <span className="size-1.5 rounded-full bg-primary" />}
                  {hasBooked && <span className="size-1.5 rounded-full bg-muted-foreground" />}
                  {dayEvents.length > 2 && <span className="text-[9px] text-muted-foreground">{dayEvents.length}</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── View mode toggle (rendered inside WeeklyCalendar header via headerLeft) ──

function ViewToggle({ viewMode, setViewMode }: { viewMode: ViewMode; setViewMode: (v: ViewMode) => void }) {
  const options: { key: ViewMode; label: string; icon: typeof Calendar }[] = [
    { key: 'day', label: 'Day', icon: List },
    { key: 'week', label: 'Week', icon: Calendar },
    { key: 'month', label: 'Month', icon: CalendarDays },
  ]
  return (
    <div className="flex rounded-lg border border-border bg-white/60 p-0.5">
      {options.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" onClick={() => setViewMode(key)}
          className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            viewMode === key ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground')}>
          <Icon className="size-3" />
          {label}
        </button>
      ))}
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
  rangeEndDate,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('yours')
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [duration, setDuration] = useState<30 | 60>(30)
  const [bookingPopup, setBookingPopup] = useState<{ slot: TimeSlot; coachId: string } | null>(null)
  const [viewPopup, setViewPopup] = useState<ExistingBooking | null>(null)
  const [dayPopup, setDayPopup] = useState<string | null>(null) // YYYY-MM-DD for monthly day click
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [isStanding, setIsStanding] = useState(false)
  // Coach filter: which coaches to show (default: all)
  const [selectedCoachIds, setSelectedCoachIds] = useState<Set<string>>(() => new Set())

  const bookableCoaches = useMemo(() => {
    return coaches.filter(coach => {
      if (coach.rate_per_hour_cents <= 0) return false
      return players.some(player => {
        const entries = allowedCoaches.filter(a => a.player_id === player.id)
        return entries.length === 0 || entries.some(a => a.coach_id === coach.id)
      })
    })
  }, [coaches, players, allowedCoaches])

  // Build coach → color index map
  const coachColorMap = useMemo(() => {
    const map = new Map<string, number>()
    bookableCoaches.forEach((c, i) => map.set(c.id, i))
    return map
  }, [bookableCoaches])

  // Initialize selectedCoachIds with all coaches when first available
  useEffect(() => {
    if (selectedCoachIds.size === 0 && bookableCoaches.length > 0) {
      setSelectedCoachIds(new Set(bookableCoaches.map(c => c.id)))
    }
  }, [bookableCoaches]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effective coach IDs to show (all if none explicitly selected after toggle-off-all)
  const visibleCoachIds = useMemo(() => {
    if (selectedCoachIds.size === 0) return new Set(bookableCoaches.map(c => c.id))
    return selectedCoachIds
  }, [selectedCoachIds, bookableCoaches])

  // ── "Your Privates" events ──────────────────────────────────────────

  const yourEvents = useMemo((): CalendarEvent[] => {
    return existingBookings
      .filter(b => b.sessions?.date && b.sessions?.start_time && b.sessions?.end_time)
      .map(b => {
        const s = b.sessions!
        const coachName = s.coaches?.name?.split(' ')[0] ?? 'Coach'
        const playerName = playerMap[b.player_id]?.split(' ')[0] ?? ''
        const dateObj = new Date(s.date + 'T12:00:00')
        const dayOfWeek = dateObj.getDay()
        const label = getBookingLabel(b.status, b.approval_status, b.cancellation_type)

        return {
          id: b.id,
          title: `Private w/ ${coachName}`,
          subtitle: `${playerName} · ${label}`,
          dayOfWeek,
          startTime: s.start_time!,
          endTime: s.end_time!,
          date: s.date,
          color: getBookingColor(b.status, b.approval_status, b.cancellation_type),
          selectable: true,
        }
      })
  }, [existingBookings, playerMap])

  // ── Coach availability events ───────────────────────────────────────

  const coachEvents = useMemo((): CalendarEvent[] => {
    if (activeTab === 'yours') return []

    return bookableCoaches
      .filter(c => visibleCoachIds.has(c.id))
      .flatMap((coach) => {
        const idx = coachColorMap.get(coach.id) ?? 0
        return generateCoachAvailabilityEvents(
          coach.id, coach.name,
          coachWindows.filter(w => w.coach_id === coach.id),
          coachExceptions.filter(e => e.coach_id === coach.id),
          bookedSessions.filter(s => s.coach_id === coach.id),
          duration, coach.id, idx, rangeEndDate, existingBookings,
        )
      })
  }, [activeTab, visibleCoachIds, bookableCoaches, coachWindows, coachExceptions, bookedSessions, duration, rangeEndDate, coachColorMap, existingBookings])

  const activeEvents = activeTab === 'yours' ? yourEvents : coachEvents

  // Next upcoming private for jump button
  const nextPrivateDate = useMemo(() => {
    const now = new Date()
    return existingBookings
      .filter(b => b.status !== 'cancelled' && b.sessions?.date)
      .map(b => b.sessions!.date)
      .filter(d => new Date(d + 'T23:59:59') >= now)
      .sort()[0] ?? null
  }, [existingBookings])

  // Standing dates preview
  const standingDates = useMemo(() => {
    if (!isStanding || !bookingPopup) return []
    const dayOfWeek = new Date(bookingPopup.slot.date + 'T12:00:00').getDay()
    return getStandingDates(dayOfWeek, bookingPopup.slot.date)
  }, [isStanding, bookingPopup])

  // ── Event click handler ─────────────────────────────────────────────

  const handleEventClick = (event: CalendarEvent) => {
    if (!event.selectable || !event.date) return

    // Own booking on any tab — show view/cancel popup
    if (event.id.startsWith('own-')) {
      const bookingId = event.id.replace('own-', '')
      const booking = existingBookings.find(b => b.id === bookingId)
      if (booking) { setViewPopup(booking); return }
    }

    if (activeTab === 'yours') {
      const booking = existingBookings.find(b => b.id === event.id)
      if (booking) setViewPopup(booking)
      return
    }

    // Extract coach ID from event ID (format: coachId-avail-... or coachId-booked-...)
    const coachId = event.id.split('-avail-')[0].split('-booked-')[0]

    setBookingPopup({
      slot: { date: event.date, startTime: event.startTime, endTime: event.endTime },
      coachId,
    })
    setSelectedPlayerId(null)
    setIsStanding(false)
  }

  const popupCoach = bookingPopup ? bookableCoaches.find(c => c.id === bookingPopup.coachId) : null
  const popupPriceCents = popupCoach ? Math.round((popupCoach.rate_per_hour_cents * duration) / 60) : 0

  const popupEligiblePlayers = useMemo(() => {
    if (!popupCoach) return []
    return players.filter(player => {
      const entries = allowedCoaches.filter(a => a.player_id === player.id)
      return entries.length === 0 || entries.some(a => a.coach_id === popupCoach.id)
    })
  }, [players, allowedCoaches, popupCoach])

  const effectivePlayerId = popupEligiblePlayers.length === 1 ? popupEligiblePlayers[0].id : selectedPlayerId
  const canSubmit = !!effectivePlayerId && !!bookingPopup
  const isCoachTab = activeTab === 'availabilities'

  return (
    <div className="space-y-3">
      {/* Main tabs: Your Privates / Availabilities */}
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => { setActiveTab('yours'); setBookingPopup(null) }}
          className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-all', activeTab === 'yours' ? 'bg-primary text-white shadow-sm' : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
          Your Privates
        </button>
        <button type="button" onClick={() => { setActiveTab('availabilities'); setBookingPopup(null) }}
          className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-all', isCoachTab ? 'bg-primary text-white shadow-sm' : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
          Availabilities
        </button>

        {isCoachTab && (
          <div className="ml-auto">
            <DurationPills duration={duration} onChange={(d) => { setDuration(d); setBookingPopup(null) }} />
          </div>
        )}
      </div>

      {/* Coach filter — shown when on Availabilities */}
      {isCoachTab && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {bookableCoaches.map((coach) => {
              const isActive = visibleCoachIds.has(coach.id)
              return (
                <button key={coach.id} type="button" onClick={() => {
                  setSelectedCoachIds(prev => {
                    const next = new Set(prev)
                    if (next.has(coach.id)) {
                      next.delete(coach.id)
                    } else {
                      next.add(coach.id)
                    }
                    return next
                  })
                  setBookingPopup(null)
                }}
                  className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium transition-all', isActive ? 'bg-primary/10 text-primary border border-primary/30' : 'border border-border text-muted-foreground/50 line-through')}>
                  {coach.name}
                </button>
              )
            })}
          </div>

          {/* Pricing table */}
          <table className="mx-auto w-fit text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium py-0.5 pr-6">Coach</th>
                <th className="text-right font-medium py-0.5 px-3">30min</th>
                <th className="text-right font-medium py-0.5 pl-3">1hr</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filteredCoaches = bookableCoaches.filter(c => visibleCoachIds.has(c.id))
                // Group: Maxim alone, Zoe alone, then rest together
                const maxim = filteredCoaches.find(c => c.name.toLowerCase().includes('maxim'))
                const zoe = filteredCoaches.find(c => c.name.toLowerCase().includes('zoe'))
                const rest = filteredCoaches.filter(c => c !== maxim && c !== zoe)
                const rows: { label: string; rate: number }[] = []
                if (maxim) rows.push({ label: maxim.name.split(' ')[0], rate: maxim.rate_per_hour_cents })
                if (zoe) rows.push({ label: zoe.name.split(' ')[0], rate: zoe.rate_per_hour_cents })
                if (rest.length > 0) {
                  const rate = rest[0].rate_per_hour_cents
                  const label = rest.length <= 2 ? rest.map(c => c.name.split(' ')[0]).join(', ') : 'Other coaches'
                  rows.push({ label, rate })
                }
                return rows.map(r => (
                  <tr key={r.label} className="border-t border-border/30">
                    <td className="py-1 pr-6 text-foreground font-medium">{r.label}</td>
                    <td className="py-1 px-3 text-right font-semibold text-foreground">${(r.rate / 200).toFixed(0)}</td>
                    <td className="py-1 pl-3 text-right font-semibold text-foreground">${(r.rate / 100).toFixed(0)}</td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Calendar */}
      {viewMode === 'month' ? (
        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border bg-gradient-to-r from-dawn-cream to-peach-mist/40 px-3 py-2">
            <div className="flex items-center justify-center">
              <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
            </div>
          </div>
          <MonthlyCalendar events={activeEvents} onDayClick={(dateStr) => setDayPopup(dateStr)} />
        </div>
      ) : (
        <WeeklyCalendar
          events={activeEvents}
          onEventClick={handleEventClick}
          nextJumpDate={activeTab === 'yours' ? nextPrivateDate ?? undefined : undefined}
          nextJumpLabel="Next private"
          defaultView={viewMode}
          hideViewToggle
          headerLeft={<ViewToggle viewMode={viewMode} setViewMode={setViewMode} />}
        />
      )}

      {/* ── View existing booking popup ──────────────────────────────── */}
      {viewPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setViewPopup(null)}>
          <div className="w-full max-w-md animate-slide-up rounded-2xl bg-popover p-5 shadow-elevated" style={{ maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-foreground">Private Lesson</h3>
              <button type="button" onClick={() => setViewPopup(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"><X className="size-4" /></button>
            </div>

            <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <span className={cn('font-medium', {
                  'text-emerald-700': viewPopup.approval_status === 'approved' && viewPopup.status !== 'cancelled',
                  'text-amber-700': viewPopup.approval_status === 'pending',
                  'text-red-600': viewPopup.status === 'cancelled' || viewPopup.approval_status === 'declined',
                })}>{getBookingLabel(viewPopup.status, viewPopup.approval_status, viewPopup.cancellation_type)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Player</span>
                <span className="font-medium">{playerMap[viewPopup.player_id] ?? 'Unknown'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Coach</span>
                <span className="font-medium">{viewPopup.sessions?.coaches?.name?.split(' ')[0] ?? 'Unknown'}</span>
              </div>
              {viewPopup.sessions && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium">{new Date(viewPopup.sessions.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Time</span>
                    <span className="font-medium">{viewPopup.sessions.start_time ? formatTime(viewPopup.sessions.start_time) : ''} – {viewPopup.sessions.end_time ? formatTime(viewPopup.sessions.end_time) : ''}</span>
                  </div>
                </>
              )}
              {viewPopup.price_cents != null && (
                <div className="border-t border-border pt-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Price</span>
                    <span>${(viewPopup.price_cents / 100).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {viewPopup.status !== 'cancelled' && viewPopup.approval_status !== 'declined' && (
              <form action={cancelPrivateBooking} className="mt-3">
                <input type="hidden" name="booking_id" value={viewPopup.id} />
                <CancelButton />
              </form>
            )}

            {viewPopup.status === 'cancelled' &&
              (viewPopup.cancellation_type === 'parent_24h' || viewPopup.cancellation_type === 'parent_late') &&
              viewPopup.sessions?.coach_id && (
              <Button type="button" size="sm" className="mt-3 w-full" onClick={() => {
                setViewPopup(null)
                setBookingPopup({ slot: { date: viewPopup.sessions!.date, startTime: viewPopup.sessions!.start_time!, endTime: viewPopup.sessions!.end_time! }, coachId: viewPopup.sessions!.coach_id! })
                setSelectedPlayerId(null)
                setIsStanding(false)
              }}>Re-book this slot</Button>
            )}
          </div>
        </div>
      )}

      {/* ── Book new slot popup ──────────────────────────────────────── */}
      {bookingPopup && popupCoach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setBookingPopup(null)}>
          <div className="w-full max-w-md animate-slide-up rounded-2xl bg-popover p-5 shadow-elevated" style={{ maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-foreground">Book Private Lesson</h3>
              <button type="button" onClick={() => setBookingPopup(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"><X className="size-4" /></button>
            </div>

            <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Coach</span>
                <span className="font-medium">{popupCoach.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{new Date(bookingPopup.slot.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{formatTime(bookingPopup.slot.startTime)} – {formatTime(minutesToTime(timeToMinutes(bookingPopup.slot.startTime) + duration))}</span>
              </div>
              <div className="border-t border-border pt-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span>Price</span>
                  <span>${(popupPriceCents / 100).toFixed(2)} (incl. GST)</span>
                </div>
              </div>
            </div>

            {popupEligiblePlayers.length > 1 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">Who is this lesson for?</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {popupEligiblePlayers.map((player) => (
                    <button key={player.id} type="button" onClick={() => setSelectedPlayerId(player.id)}
                      className={cn('rounded-full px-3 py-1 text-xs font-medium transition-all', effectivePlayerId === player.id ? 'bg-primary text-white shadow-sm' : 'border border-border text-foreground hover:bg-muted/50')}>
                      {player.first_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="mt-3 flex items-center gap-2 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-muted/30">
              <input type="checkbox" checked={isStanding} onChange={(e) => setIsStanding(e.target.checked)} className="size-3.5 rounded border-border" />
              <div>
                <span className="text-xs font-medium">Make this a weekly booking</span>
                <p className="text-[10px] text-muted-foreground">Books every week for the rest of the term</p>
              </div>
            </label>

            {/* Standing dates preview */}
            {isStanding && standingDates.length > 0 && (
              <div className="mt-2 rounded-lg border border-border bg-muted/20 p-2.5">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">{standingDates.length + 1} sessions total:</p>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {new Date(bookingPopup.slot.date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </span>
                  {standingDates.map(d => (
                    <span key={d} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {isStanding && standingDates.length === 0 && (
              <p className="mt-2 text-[10px] text-amber-600">No additional weeks remaining this term</p>
            )}

            <form action={isStanding ? requestStandingPrivate : requestPrivateBooking} className="mt-3">
              <input type="hidden" name="player_id" value={effectivePlayerId ?? ''} />
              <input type="hidden" name="coach_id" value={bookingPopup.coachId} />
              <input type="hidden" name="date" value={bookingPopup.slot.date} />
              <input type="hidden" name="start_time" value={bookingPopup.slot.startTime} />
              <input type="hidden" name="duration_minutes" value={duration} />
              <SubmitButton disabled={!canSubmit}>
                {isStanding ? `Book ${standingDates.length + 1} Weekly Sessions` : 'Request Booking'}
              </SubmitButton>
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

      {/* ── Monthly day popup ────────────────────────────────────────── */}
      {dayPopup && (() => {
        const dayEvents = activeEvents.filter(e => e.date === dayPopup)
        const dateObj = new Date(dayPopup + 'T12:00:00')
        const dateLabel = dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        const dotColors = ['bg-[#2B5EA7]', 'bg-[#E87450]', 'bg-[#8B78B0]', 'bg-[#F5B041]', 'bg-[#6480A4]']

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDayPopup(null)}>
            <div className="w-full max-w-md animate-slide-up rounded-2xl bg-popover p-5 shadow-elevated" style={{ maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-semibold text-foreground">{dateLabel}</h3>
                <button type="button" onClick={() => setDayPopup(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"><X className="size-4" /></button>
              </div>

              {dayEvents.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">No sessions on this day</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {dayEvents.map(ev => {
                    // Determine coach color
                    const coachId = ev.id.startsWith('own-')
                      ? existingBookings.find(b => b.id === ev.id.replace('own-', ''))?.sessions?.coach_id
                      : ev.id.split('-avail-')[0].split('-booked-')[0]
                    const cIdx = coachId ? (coachColorMap.get(coachId) ?? 0) : 0
                    const dotColor = dotColors[cIdx % dotColors.length]

                    return (
                      <button
                        key={ev.id}
                        type="button"
                        disabled={!ev.selectable}
                        onClick={() => {
                          setDayPopup(null)
                          handleEventClick(ev)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-colors',
                          ev.selectable ? 'border-border hover:bg-muted/30 cursor-pointer' : 'border-border/50 opacity-60 cursor-default'
                        )}
                      >
                        <span className={cn('size-2.5 shrink-0 rounded-full', dotColor)} />
                        <span className="font-medium">{formatTimeShort(ev.startTime)}</span>
                        <span className="text-muted-foreground">{ev.subtitle ?? ev.title}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function isPlayerAutoApproved(playerId: string, coachId: string, allowed: AllowedEntry[]): boolean {
  const entry = allowed.find(a => a.player_id === playerId && a.coach_id === coachId)
  return entry?.auto_approve ?? false
}
