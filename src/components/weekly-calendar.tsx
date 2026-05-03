'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, X, Clock, Users, DollarSign, CheckCircle, ExternalLink, Loader2, CalendarDays, List } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { getTermInfo, getNextTermStart } from '@/lib/utils/school-terms'
import { formatCurrency } from '@/lib/utils/currency'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_MAP: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }

const HOUR_START = 7
const HOUR_END = 20

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface CalendarEvent {
  id: string
  title: string
  subtitle?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  color?: string
  href?: string
  programType?: string
  playerNames?: string[]
  /** If set, event only appears on the week containing this date */
  date?: string
  /** Session UUID for booking actions */
  sessionId?: string
  /** Program UUID */
  programId?: string
  /** Per-session price in cents */
  priceCents?: number | null
  /** Number of remaining scheduled sessions (for calculated term price) */
  remainingSessions?: number | null
  /** Early bird discount percentage */
  earlyBirdPct?: number | null
  /** Early bird deadline date string */
  earlyBirdDeadline?: string | null
  /** Whether family is enrolled in this program */
  isEnrolled?: boolean
  /** Spots remaining (null = unlimited) */
  spotsLeft?: number | null
  /** If true, clicking fires onEventClick directly without opening popup */
  selectable?: boolean
  /** If true, render compact in weekly grid (no time subtitle, smaller min-height) */
  compact?: boolean
  /** Booking ID for private lessons (used for cancel action) */
  bookingId?: string
  /** Per-player attendance status for this session: playerId → 'present'|'absent'|'noshow' */
  playerAttendance?: Record<string, string>
  /** Coach name for display in day view / admin popup */
  coachName?: string
  /** Session status for admin display */
  sessionStatus?: string
  /** Number of booked players */
  bookedCount?: number
  /** Capacity label e.g. "8/12" */
  capacityLabel?: string
  /** Capacity color: 'green' | 'amber' | 'red' | 'blue' */
  capacityColor?: 'green' | 'amber' | 'red' | 'blue'
  /** Assistant coach names */
  assistantCoaches?: string[]
  /** Inline style override (e.g. for gradient backgrounds) */
  colorStyle?: React.CSSProperties
  /** For shared private events: partner player's first name */
  partnerFirstName?: string
  /** For shared private events: partner player's last name */
  partnerLastName?: string
}

function parseTime(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am'
  if (hour < 12) return `${hour}am`
  if (hour === 12) return '12pm'
  return `${hour - 12}pm`
}

function formatTimeShort(time: string): string {
  const parts = time.split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6)
  const mDay = monday.getDate()
  const mMonth = MONTHS[monday.getMonth()]
  const sDay = sunday.getDate()
  const sMonth = MONTHS[sunday.getMonth()]
  if (monday.getMonth() === sunday.getMonth()) {
    return `${mDay} - ${sDay} ${mMonth} ${monday.getFullYear()}`
  }
  return `${mDay} ${mMonth} - ${sDay} ${sMonth} ${sunday.getFullYear()}`
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${SHORT_DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function isToday(date: Date): boolean {
  const now = new Date()
  return date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

/**
 * Compute collision layout for overlapping events in a single day column.
 * Returns a map of event ID -> { column index, total columns in group }.
 */
function computeCollisionLayout(dayEvents: CalendarEvent[]): Map<string, { col: number; total: number }> {
  const layout = new Map<string, { col: number; total: number }>()
  if (dayEvents.length === 0) return layout

  const sorted = [...dayEvents].sort((a, b) => {
    const diff = parseTime(a.startTime) - parseTime(b.startTime)
    if (diff !== 0) return diff
    return (parseTime(b.endTime) - parseTime(b.startTime)) - (parseTime(a.endTime) - parseTime(a.startTime))
  })

  const clusters: CalendarEvent[][] = []
  for (const event of sorted) {
    const eStart = parseTime(event.startTime)

    let placed = false
    for (const cluster of clusters) {
      const clusterEnd = Math.max(...cluster.map(e => parseTime(e.endTime)))
      if (eStart < clusterEnd) {
        cluster.push(event)
        placed = true
        break
      }
    }
    if (!placed) {
      clusters.push([event])
    }
  }

  for (const cluster of clusters) {
    const columns: CalendarEvent[][] = []
    for (const event of cluster) {
      const eStart = parseTime(event.startTime)
      let placed = false
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1]
        if (parseTime(lastInCol.endTime) <= eStart) {
          columns[c].push(event)
          layout.set(event.id, { col: c, total: 0 })
          placed = true
          break
        }
      }
      if (!placed) {
        columns.push([event])
        layout.set(event.id, { col: columns.length - 1, total: 0 })
      }
    }
    const totalCols = columns.length
    for (const event of cluster) {
      const entry = layout.get(event.id)!
      entry.total = totalCols
    }
  }

  return layout
}

export interface CalendarPlayer {
  id: string
  name: string
}

/** Map of programId → Set of enrolled playerIds */
export type EnrolledPlayersMap = Record<string, string[]>

/** Map of sessionId → Set of enrolled/booked playerIds (overrides enrolledPlayersMap per session) */
export type SessionEnrolledMap = Record<string, string[]>

/** Map of programId → Set of family playerIds eligible to enrol/book that program */
export type EligiblePlayersMap = Record<string, string[]>

/** Popup container — portaled to <body> with viewport-fixed positioning so
 *  it never gets clipped by the calendar wrapper's overflow:hidden. The
 *  wrapper's clip is intentional (rounds event-cell corners in week view),
 *  so we escape via portal rather than removing it.
 *
 *  popupPos coords are viewport-absolute (set by handleEventClick).
 */
function PopupContainer({
  popupRef,
  popupPos,
  children,
}: {
  popupRef: React.RefObject<HTMLDivElement | null>
  popupPos: { top: number; left: number; preferRight: boolean }
  children: React.ReactNode
}) {
  const [adjustedTop, setAdjustedTop] = useState<number>(Math.max(8, popupPos.top - 80))
  const [adjustedLeft, setAdjustedLeft] = useState<number>(popupPos.left)

  useEffect(() => {
    const popup = popupRef.current
    if (!popup) return

    requestAnimationFrame(() => {
      const popupHeight = popup.offsetHeight
      const popupWidth = popup.offsetWidth
      const vh = window.innerHeight
      const vw = window.innerWidth

      // Top: try to center vertically on click (popupPos.top - 80 is the
      // existing offset that puts the click point ~80px below popup top).
      // Clamp inside [8, vh - popupHeight - 8] so it stays on-screen.
      const idealTop = Math.max(8, popupPos.top - 80)
      const maxTop = Math.max(8, vh - popupHeight - 8)
      setAdjustedTop(Math.min(idealTop, maxTop))

      // Left: preferRight means the click was on the right half of the
      // calendar — anchor the popup to the right edge with 8px margin.
      // Otherwise position to the right of the click, clamped so the popup
      // doesn't overflow the right edge of the viewport.
      if (popupPos.preferRight) {
        setAdjustedLeft(Math.max(8, vw - popupWidth - 8))
      } else {
        setAdjustedLeft(Math.max(8, Math.min(popupPos.left, vw - popupWidth - 8)))
      }
    })
  }, [popupRef, popupPos])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-50 w-72 max-h-[70vh] overflow-y-auto animate-fade-up rounded-xl border border-border bg-white shadow-elevated"
      style={{ top: adjustedTop, left: adjustedLeft }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Attendance status display styles */
const ATTENDANCE_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  present:  { label: 'Attending',  bg: 'bg-success/5 border-success/20',  text: 'text-success' },
  absent:   { label: 'Absent',     bg: 'bg-amber-50 border-amber-200',    text: 'text-amber-600' },
  noshow:   { label: 'No show',    bg: 'bg-red-50 border-red-200',        text: 'text-red-600' },
}

/** Popup actions: attendance checklist + booking */
function PopupActions({
  event,
  players,
  enrolledPlayersMap,
  sessionEnrolledMap,
  eligiblePlayersMap,
  selectedPlayerIds,
  setSelectedPlayerIds,
  actionLoading,
  onBookSession,
  onMarkAway,
  onCancelSession,
}: {
  event: CalendarEvent
  players?: CalendarPlayer[]
  enrolledPlayersMap?: EnrolledPlayersMap
  sessionEnrolledMap?: SessionEnrolledMap
  eligiblePlayersMap?: EligiblePlayersMap
  selectedPlayerIds: Set<string>
  setSelectedPlayerIds: (ids: Set<string>) => void
  actionLoading: boolean
  onBookSession?: (sessionId: string, programId: string, playerIds: string[]) => void
  onMarkAway?: (sessionId: string, playerId: string) => void
  onCancelSession?: (sessionId: string, playerId: string) => void
}) {
  if (!event.sessionId || !event.programId || !players || players.length === 0) {
    return (
      <div className="mt-3">
        {event.href && (
          <Link
            href={event.href}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110"
          >
            {event.isEnrolled ? 'View program' : 'Book program'}
            <ExternalLink className="size-3.5" />
          </Link>
        )}
      </div>
    )
  }

  const enrolledPlayerIds = new Set(
    sessionEnrolledMap?.[event.sessionId!] ?? enrolledPlayersMap?.[event.programId] ?? []
  )
  // Term-enrolled players (in program_roster)
  const termEnrolledIds = new Set(enrolledPlayersMap?.[event.programId] ?? [])
  // Players eligible to book this program (gender/track/classification gates).
  // If the map is not provided, fall back to "everyone is eligible" — keeps
  // legacy callers working until they pass a real map.
  const eligibleIds = eligiblePlayersMap?.[event.programId]
  const isEligibleForBooking = (pid: string) =>
    eligibleIds === undefined ? true : eligibleIds.includes(pid)
  const enrolledPlayers = players.filter(p => enrolledPlayerIds.has(p.id))
  const availablePlayers = players.filter(p => !enrolledPlayerIds.has(p.id) && isEligibleForBooking(p.id))
  const att = event.playerAttendance ?? {}

  // Check if session is coach-completed (has absent/noshow statuses)
  const isCoachMarked = Object.values(att).some(s => s === 'absent' || s === 'noshow')

  return (
    <div className="mt-3 space-y-3">
      {/* Enrolled/booked players */}
      {enrolledPlayers.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            {isCoachMarked ? 'Attendance' : 'Your players'}
          </p>
          <div className="space-y-1">
            {enrolledPlayers.map(p => {
              const status = att[p.id]
              const isTermEnrolled = termEnrolledIds.has(p.id)
              const style = ATTENDANCE_STYLES[status ?? 'present'] ?? ATTENDANCE_STYLES.present

              // Coach has marked attendance — read-only display
              if (isCoachMarked) {
                return (
                  <div key={p.id} className={`flex items-center justify-between rounded-lg border px-3 py-1.5 ${style.bg}`}>
                    <span className={`text-sm font-medium ${style.text}`}>{p.name}</span>
                    <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
                  </div>
                )
              }

              // Term enrolled: attending/away toggle
              if (isTermEnrolled) {
                const isAway = status === 'absent'
                return (
                  <div key={p.id} className={`flex items-center justify-between rounded-lg border px-3 py-1.5 ${isAway ? 'bg-muted/50 border-border' : 'bg-success/5 border-success/20'}`}>
                    <span className={`text-sm font-medium ${isAway ? 'text-muted-foreground' : 'text-success'}`}>{p.name}</span>
                    <div className="flex gap-1">
                      {onBookSession && isAway && (
                        <button
                          disabled={actionLoading}
                          onClick={() => onBookSession(event.sessionId!, event.programId!, [p.id])}
                          className="rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                        >
                          {actionLoading ? <Loader2 className="size-3 animate-spin" /> : 'Attending'}
                        </button>
                      )}
                      {onMarkAway && !isAway && (
                        <button
                          disabled={actionLoading}
                          onClick={() => onMarkAway(event.sessionId!, p.id)}
                          className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                        >
                          {actionLoading ? <Loader2 className="size-3 animate-spin" /> : 'Away'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              }

              // Single session booked (not term enrolled): cancel option
              return (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-success/20 bg-success/5 px-3 py-1.5">
                  <span className="text-sm font-medium text-success">{p.name}</span>
                  {onCancelSession && (
                    <button
                      disabled={actionLoading}
                      onClick={() => onCancelSession(event.sessionId!, p.id)}
                      className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? <Loader2 className="size-3 animate-spin" /> : 'Cancel'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available players — can book */}
      {availablePlayers.length > 0 && onBookSession && event.spotsLeft !== 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Book session</p>
          <div className="space-y-1">
            {availablePlayers.map(p => {
              const selected = selectedPlayerIds.has(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    const next = new Set(selectedPlayerIds)
                    if (next.has(p.id)) next.delete(p.id)
                    else next.add(p.id)
                    setSelectedPlayerIds(next)
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                    selected
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-foreground hover:border-primary/30'
                  }`}
                >
                  <div className={`size-4 rounded border-2 flex items-center justify-center transition-all ${
                    selected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                  }`}>
                    {selected && <CheckCircle className="size-3 text-white" />}
                  </div>
                  {p.name}
                </button>
              )
            })}
          </div>
          {selectedPlayerIds.size > 0 && (
            <button
              disabled={actionLoading}
              onClick={() => onBookSession(event.sessionId!, event.programId!, [...selectedPlayerIds])}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Book {selectedPlayerIds.size} player{selectedPlayerIds.size > 1 ? 's' : ''}
                  {event.priceCents ? ` · ${formatCurrency(event.priceCents * selectedPlayerIds.size)}` : ''}
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Program link — wording depends on enrolment state for the family */}
      {event.href && (() => {
        const familyHasEnrolled = termEnrolledIds.size > 0
        const someEligibleNotEnrolled = availablePlayers.length > 0
        const label = familyHasEnrolled
          ? someEligibleNotEnrolled ? 'Manage enrolment' : 'View program'
          : 'Book full term'
        return (
          <Link
            href={event.href}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted/50"
          >
            {label}
            <ExternalLink className="size-3.5" />
          </Link>
        )
      })()}
    </div>
  )
}

export function WeeklyCalendar({
  events,
  onEventClick,
  players,
  enrolledPlayersMap,
  sessionEnrolledMap,
  eligiblePlayersMap,
  onBookSession,
  onMarkAway,
  onCancelPrivate,
  onCancelSession,
  nextJumpDate,
  nextJumpDates,
  nextJumpLabel,
  headerLeft,
  renderPopup,
  renderDayEvent,
  defaultView,
  hideCapacity,
  hideViewToggle,
  onDayClick,
  initialJumpDate,
  onViewModeChange,
  hideNextTerm,
}: {
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  /** Family players available for booking */
  players?: CalendarPlayer[]
  /** Which players are enrolled in which programs */
  enrolledPlayersMap?: EnrolledPlayersMap
  /** Per-session enrolled/booked players (overrides enrolledPlayersMap) */
  sessionEnrolledMap?: SessionEnrolledMap
  /** Per-program eligible playerIds. Players outside the set are hidden from
   *  the casual-booking selector. Undefined map = everyone is eligible. */
  eligiblePlayersMap?: EligiblePlayersMap
  /** Called when user books a session for selected players */
  onBookSession?: (sessionId: string, programId: string, playerIds: string[]) => Promise<{ error?: string }>
  /** Called when user marks a player as away for a session */
  onMarkAway?: (sessionId: string, playerId: string) => Promise<{ error?: string }>
  /** Called when user cancels a private booking */
  onCancelPrivate?: (bookingId: string) => Promise<{ error?: string }>
  /** Called when user cancels a single session booking (not term enrolled) */
  onCancelSession?: (sessionId: string, playerId: string) => Promise<{ error?: string }>
  /** Date string (YYYY-MM-DD) to jump to via a custom button */
  nextJumpDate?: string
  /** Array of date strings — calendar picks the first one after the current view */
  nextJumpDates?: string[]
  /** Label for the jump button (e.g. "Next private") */
  nextJumpLabel?: string
  /** Content to render at the left of the week navigation header */
  headerLeft?: React.ReactNode
  /** Custom popup renderer — replaces default popup content when provided */
  renderPopup?: (event: CalendarEvent, onClose: () => void) => React.ReactNode
  /** Custom day view event renderer — replaces default event block in day view */
  renderDayEvent?: (event: CalendarEvent) => React.ReactNode
  /** Default view mode */
  defaultView?: 'week' | 'day'
  /** Hide capacity labels (for parent views) */
  hideCapacity?: boolean
  /** Hide the internal Week/Day view toggle (when controlled externally) */
  hideViewToggle?: boolean
  /** Called when user clicks a day column header in week view */
  onDayClick?: (dayIndex: number) => void
  /** Date string (YYYY-MM-DD) to auto-jump to on first mount (e.g. next available) */
  initialJumpDate?: string
  /** Called when internal view mode changes (e.g. day header click in week view) */
  onViewModeChange?: (mode: 'week' | 'day') => void
  /** Hide the generic "Next term" jump button */
  hideNextTerm?: boolean
}) {
  const [viewMode, setViewMode] = useState<'week' | 'day'>(defaultView ?? 'week')

  // Sync internal viewMode when controlled externally via defaultView
  useEffect(() => {
    if (defaultView && hideViewToggle) setViewMode(defaultView)
  }, [defaultView, hideViewToggle])

  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    // Default to today's index (0=Mon...6=Sun)
    const day = new Date().getDay()
    return day === 0 ? 6 : day - 1
  })

  // Default to term start week if we're before the next term, otherwise today
  const [weekOffset, setWeekOffset] = useState(() => {
    const today = new Date()
    const termInfo = getTermInfo(getMonday(today))
    // If we're currently in a term or holidays info doesn't indicate a gap, default to today (0)
    if (termInfo && !termInfo.includes('Holidays') && !termInfo.includes('Summer')) return 0
    // We're in holidays — jump to next term start
    const nextStart = getNextTermStart(today)
    if (!nextStart) return 0
    const todayMonday = getMonday(today)
    const nextTermMonday = getMonday(nextStart)
    return Math.round((nextTermMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  })
  // Auto-jump to `initialJumpDate` on first render only
  useEffect(() => {
    if (!initialJumpDate) return
    const target = new Date(initialJumpDate + 'T12:00:00')
    if (isNaN(target.getTime())) return
    const todayMonday = getMonday(new Date())
    const targetMonday = getMonday(target)
    const offset = Math.round((targetMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000))
    setWeekOffset(offset)
    const day = target.getDay()
    setSelectedDayIndex(day === 0 ? 6 : day - 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [popupEvent, setPopupEvent] = useState<CalendarEvent | null>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; preferRight: boolean } | null>(null)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const hourHeight = 60

  const monday = useMemo(() => {
    const m = getMonday(new Date())
    return addDays(m, weekOffset * 7)
  }, [weekOffset])

  // End-of-week boundary for inclusive Sunday comparison. Without an exclusive
  // upper bound, events dated `YYYY-MM-DDT12:00:00` on Sunday fail a `<= sunday`
  // check (which would be midnight start-of-Sunday).
  const weekEndExclusive = useMemo(() => addDays(monday, 7), [monday])

  const weekDates = useMemo(() =>
    DAYS.map((_, i) => addDays(monday, i)),
  [monday])

  // Filter events to this week — date-based events only show on their date's week
  const weekEvents = useMemo(() => {
    return events.filter(e => {
      if (e.date) {
        const eventDate = new Date(e.date + 'T12:00:00')
        return eventDate >= monday && eventDate < weekEndExclusive
      }
      // Non-date events (recurring) show every week
      return true
    })
  }, [events, monday, weekEndExclusive])

  const { minHour, maxHour } = useMemo(() => {
    if (weekEvents.length === 0) return { minHour: HOUR_START, maxHour: HOUR_END }
    let min = HOUR_END
    let max = HOUR_START
    for (const e of weekEvents) {
      const start = parseTime(e.startTime)
      const end = parseTime(e.endTime)
      if (Math.floor(start) < min) min = Math.floor(start)
      if (Math.ceil(end) > max) max = Math.ceil(end)
    }
    return { minHour: Math.max(min - 1, 0), maxHour: Math.min(max + 1, 24) }
  }, [weekEvents])

  const visibleHours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i)

  // Close popup on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
      setPopupEvent(null)
      setPopupPos(null)
    }
  }, [])

  useEffect(() => {
    if (popupEvent) {
      document.addEventListener('mousedown', handleOutsideClick)
      return () => document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [popupEvent, handleOutsideClick])

  // Close popup when navigating weeks
  useEffect(() => {
    setPopupEvent(null)
    setPopupPos(null)
  }, [weekOffset])

  function handleEventClick(event: CalendarEvent, buttonEl: HTMLButtonElement) {
    // Selectable events fire callback directly without popup
    if (event.selectable) {
      onEventClick?.(event)
      return
    }

    if (popupEvent?.id === event.id) {
      setPopupEvent(null)
      setPopupPos(null)
      return
    }

    const calRect = calendarRef.current?.getBoundingClientRect()
    const btnRect = buttonEl.getBoundingClientRect()
    if (!calRect) return

    // Viewport-absolute coords — popup is portaled to <body> with
    // position: fixed, so the visual reference is the viewport, not the
    // calendar wrapper. preferRight is still calendar-relative because
    // it's about which side of the event sits visually nearer the edge.
    const top = btnRect.top + btnRect.height / 2
    const left = btnRect.right + 8
    const preferRight = btnRect.left - calRect.left > calRect.width / 2

    setPopupEvent(event)
    setPopupPos({ top, left, preferRight })
    setSelectedPlayerIds(new Set())
    setActionResult(null)
    onEventClick?.(event)
  }

  function getEventsForDay(colIdx: number): CalendarEvent[] {
    return weekEvents.filter(e => {
      if (e.date) {
        const eventDate = new Date(e.date + 'T12:00:00')
        return isSameDay(eventDate, weekDates[colIdx])
      }
      return DAY_MAP[e.dayOfWeek] === colIdx
    })
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const earlyBirdActive = popupEvent?.earlyBirdDeadline
    ? todayStr <= popupEvent.earlyBirdDeadline
    : false

  return (
    <div ref={calendarRef} className="relative overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* Week navigation header */}
      <div className="border-b border-border bg-gradient-to-r from-dawn-cream to-peach-mist/40 px-3 py-2">
        {/* Row 1: Nav arrows + date */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => viewMode === 'day'
              ? setSelectedDayIndex(i => { if (i === 0) { setWeekOffset(o => o - 1); return 6 } return i - 1 })
              : setWeekOffset(o => o - 1)
            }
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-semibold text-foreground">
              {viewMode === 'day'
                ? formatDayDate(toLocalDateStr(addDays(monday, selectedDayIndex)))
                : formatWeekRange(monday)
              }
            </span>
            {(() => {
              const term = getTermInfo(monday)
              return term ? (
                <span className="text-[11px] font-medium text-muted-foreground">{term}</span>
              ) : null
            })()}
          </div>
          <button
            onClick={() => viewMode === 'day'
              ? setSelectedDayIndex(i => { if (i === 6) { setWeekOffset(o => o + 1); return 0 } return i + 1 })
              : setWeekOffset(o => o + 1)
            }
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        {/* Row 2: View toggle + jump buttons */}
        <div className="mt-1.5 flex items-center justify-center gap-2 flex-wrap">
          {headerLeft}
          {!hideViewToggle && (
            <div className="flex rounded-lg border border-border bg-white/60 p-0.5">
              <button
                onClick={() => setViewMode('day')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  viewMode === 'day' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <List className="size-3" />
                Day
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  viewMode === 'week' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <CalendarDays className="size-3" />
                Week
              </button>
            </div>
          )}
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              Today
            </button>
          )}
          {!hideNextTerm && (() => {
            const nextTerm = getNextTermStart(new Date())
            if (!nextTerm) return null
            const todayMonday = getMonday(new Date())
            const nextTermMonday = getMonday(nextTerm)
            const diffWeeks = Math.round((nextTermMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000))
            if (diffWeeks <= 0 || diffWeeks === weekOffset) return null
            return (
              <button
                onClick={() => {
                  setWeekOffset(diffWeeks)
                  // In day view, jump to the term start day (not stay on current selectedDayIndex)
                  if (viewMode === 'day') {
                    const day = nextTerm.getDay()
                    setSelectedDayIndex(day === 0 ? 6 : day - 1)
                  }
                }}
                className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
              >
                Next term
              </button>
            )
          })()}
          {nextJumpLabel && (() => {
            // If nextJumpDates provided, find the first date on a different week than current view
            const todayMonday = getMonday(new Date())
            let targetDate: string | null = null

            if (nextJumpDates && nextJumpDates.length > 0) {
              const currentViewMonday = addDays(todayMonday, weekOffset * 7)
              const currentViewSunday = addDays(currentViewMonday, 6)
              const viewEndStr = toLocalDateStr(currentViewSunday)
              // Find first date after the current view week
              targetDate = nextJumpDates.find(d => d > viewEndStr) ?? null
              // If nothing after, try finding the earliest that's on a different week
              if (!targetDate) {
                const viewStartStr = toLocalDateStr(currentViewMonday)
                targetDate = nextJumpDates.find(d => d < viewStartStr) ?? null
              }
            } else if (nextJumpDate) {
              targetDate = nextJumpDate
            }

            if (!targetDate) return null
            const jumpDate = new Date(targetDate + 'T12:00:00')
            const jumpMonday = getMonday(jumpDate)
            const diffWeeks = Math.round((jumpMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000))
            if (diffWeeks === weekOffset && (viewMode !== 'day' || selectedDayIndex === (jumpDate.getDay() === 0 ? 6 : jumpDate.getDay() - 1))) return null
            return (
              <button
                onClick={() => {
                  setWeekOffset(diffWeeks)
                  if (viewMode === 'day') {
                    const day = jumpDate.getDay()
                    setSelectedDayIndex(day === 0 ? 6 : day - 1)
                  }
                }}
                className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {nextJumpLabel}
              </button>
            )
          })()}
        </div>
      </div>

      {weekEvents.length === 0 && viewMode !== 'day' ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm text-muted-foreground">No sessions this week</p>
          <p className="mt-1 text-xs text-muted-foreground/70">Use the arrows to navigate to another week</p>
        </div>
      ) : viewMode === 'day' ? (
        /* ── Day View ── */
        (() => {
          const dayDate = weekDates[selectedDayIndex]
          const dayEvents = getEventsForDay(selectedDayIndex)
            .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime))

          if (dayEvents.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm text-muted-foreground">No sessions on {DAYS[selectedDayIndex]}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">Use the arrows to navigate to another day</p>
              </div>
            )
          }

          return (
            <div className="divide-y divide-border">
              {/* Day selector pills */}
              <div className="flex items-center justify-center gap-1 bg-muted/30 px-4 py-2">
                {DAYS.map((day, i) => {
                  const date = weekDates[i]
                  const hasEvents = getEventsForDay(i).length > 0
                  const today = isToday(date)
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDayIndex(i)}
                      className={cn(
                        'flex flex-col items-center rounded-lg px-2 py-1.5 text-[10px] transition-colors',
                        i === selectedDayIndex
                          ? 'bg-primary text-white'
                          : today
                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                            : hasEvents
                              ? 'text-foreground hover:bg-muted'
                              : 'text-muted-foreground/50 hover:bg-muted'
                      )}
                    >
                      <span className="font-medium uppercase">{day.slice(0, 3)}</span>
                      <span className="font-bold text-xs">{date.getDate()}</span>
                    </button>
                  )
                })}
              </div>

              {/* Event cards */}
              <div className="space-y-2 p-4">
                {dayEvents.map((event) => {
                  if (renderDayEvent) {
                    return <div key={event.id}>{renderDayEvent(event)}</div>
                  }

                  const CAPACITY_COLORS = {
                    green: 'bg-success/10 text-success',
                    amber: 'bg-amber-100 text-amber-700',
                    red: 'bg-danger/10 text-danger',
                    blue: 'bg-primary/10 text-primary',
                  }

                  const isDarkBg = event.color?.includes('text-white') || event.color?.includes('text-black')

                  return (
                    <button
                      key={event.id}
                      onClick={(e) => handleEventClick(event, e.currentTarget)}
                      className={cn(
                        'w-full rounded-lg border text-left transition-all hover:shadow-md',
                        event.color ?? 'border-primary/30 bg-primary/5',
                        event.isEnrolled && 'ring-2 ring-white/70 shadow-md border-l-4',
                        popupEvent?.id === event.id && 'ring-2 ring-primary',
                        event.sessionStatus === 'cancelled' && 'opacity-30 grayscale',
                        event.sessionStatus === 'rained_out' && 'opacity-50 grayscale',
                      )}
                      style={event.colorStyle}
                    >
                      <div className="flex items-start justify-between p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={cn('font-semibold truncate', isDarkBg ? 'text-inherit' : 'text-foreground')}>{event.title}</p>
                            {event.sessionStatus && !isDarkBg && (
                              <span className={cn(
                                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                                event.sessionStatus === 'completed' ? 'bg-success/10 text-success' :
                                event.sessionStatus === 'cancelled' ? 'bg-danger/10 text-danger' :
                                event.sessionStatus === 'rained_out' ? 'bg-blue-100 text-blue-700' :
                                'bg-muted text-muted-foreground'
                              )}>
                                {event.sessionStatus.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          <div className={cn('mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', isDarkBg ? 'text-inherit opacity-90' : 'text-muted-foreground')}>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5" />
                              {formatTimeShort(event.startTime)} – {formatTimeShort(event.endTime)}
                            </span>
                            {event.coachName && (
                              <span className="flex items-center gap-1">
                                <Users className="size-3.5" />
                                {event.coachName}
                              </span>
                            )}
                            {event.subtitle && (
                              <span>{event.subtitle}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 ml-2">
                          {event.isEnrolled && (
                            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-success">
                              <CheckCircle className="mr-0.5 inline size-3" />Enrolled
                            </span>
                          )}
                          {event.playerNames && event.playerNames.length > 0 && (
                            <span className="text-xs font-medium opacity-80">{event.playerNames.join(', ')}</span>
                          )}
                          {event.capacityLabel && !hideCapacity && (
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                              CAPACITY_COLORS[event.capacityColor ?? 'green']
                            )}>
                              {event.capacityLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()
      ) : (
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Day headers with dates */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/30">
            <div className="p-2" />
            {DAYS.map((day, i) => {
              const date = weekDates[i]
              const today = isToday(date)
              return (
                <button key={day} type="button" onClick={() => { setViewMode('day'); setSelectedDayIndex(i); onViewModeChange?.('day') }} className={cn(
                  'group border-l border-border px-1 py-1.5 text-center cursor-pointer hover:bg-primary/10 transition-colors',
                  today && 'bg-primary/5',
                  !today && i >= 5 && 'bg-warm-sand/15'
                )}>
                  <span className={cn(
                    'text-[10px] font-medium uppercase tracking-wide',
                    today ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
                  )}>
                    {day.slice(0, 3)}
                  </span>
                  <div className={cn(
                    'mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    today ? 'bg-primary text-white' : 'text-foreground group-hover:bg-primary/10'
                  )}>
                    {date.getDate()}
                  </div>
                  <div className={cn(
                    'mx-auto mt-0.5 h-0.5 w-4 rounded-full transition-colors',
                    today ? 'bg-primary/30' : 'bg-muted-foreground/15 group-hover:bg-primary/30'
                  )} />
                </button>
              )
            })}
          </div>

          {/* Time grid */}
          <div className="relative grid grid-cols-[60px_repeat(7,1fr)]">
            {/* Hour labels + lines */}
            <div className="relative">
              {visibleHours.map((hour) => (
                <div key={hour} className="relative" style={{ height: hourHeight }}>
                  <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground tabular-nums">
                    {formatHour(hour)}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns with events */}
            {DAYS.map((day, colIdx) => {
              const today = isToday(weekDates[colIdx])
              return (
                <div
                  key={day}
                  className={cn(
                    'relative border-l border-border',
                    today && 'bg-primary/[0.02]',
                    !today && colIdx >= 5 && 'bg-warm-sand/10'
                  )}
                  style={{ height: visibleHours.length * hourHeight }}
                >
                  {/* Hour grid lines */}
                  {visibleHours.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-border/50"
                      style={{ top: (hour - minHour) * hourHeight }}
                    />
                  ))}

                  {/* Events for this day */}
                  {(() => {
                    const dayEvents = getEventsForDay(colIdx)
                    const collisionLayout = computeCollisionLayout(dayEvents)
                    return dayEvents.map((event) => {
                      const startHour = parseTime(event.startTime)
                      const endHour = parseTime(event.endTime)
                      const top = (startHour - minHour) * hourHeight
                      // Compact/selectable events use smaller min-height since grid position shows time
                      const isCompact = event.selectable || event.compact
                      const minH = isCompact ? 28 : 44
                      const height = Math.max((endHour - startHour) * hourHeight, minH)
                      const isSelected = popupEvent?.id === event.id
                      const layout = collisionLayout.get(event.id) ?? { col: 0, total: 1 }
                      const widthPct = 100 / layout.total
                      const leftPct = layout.col * widthPct
                      const isNarrow = layout.total > 1
                      const isVeryNarrow = layout.total >= 3

                      return (
                        <button
                          key={event.id}
                          onClick={(e) => handleEventClick(event, e.currentTarget)}
                          className={cn(
                            'absolute overflow-hidden border text-left transition-all',
                            isVeryNarrow ? 'rounded px-0 py-0' : isNarrow ? 'rounded-md px-0.5 py-0.5' : 'rounded-md px-1 py-0.5',
                            isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-background brightness-110 z-10' : 'hover:brightness-110',
                            event.color ?? 'bg-primary border-primary/80 text-white',
                            event.isEnrolled && 'ring-2 ring-white/70 shadow-md',
                            event.sessionStatus === 'cancelled' && 'opacity-25 grayscale line-through',
                            event.sessionStatus === 'rained_out' && 'opacity-40 grayscale',
                          )}
                          style={{
                            top,
                            height,
                            left: `calc(${leftPct}% + 1px)`,
                            width: `calc(${widthPct}% - 2px)`,
                            ...event.colorStyle,
                          }}
                        >
                          {/* Enrolled indicator */}
                          {event.isEnrolled && !isNarrow && (
                            <div className="absolute right-0.5 top-0.5">
                              <CheckCircle className="size-3 drop-shadow-sm" />
                            </div>
                          )}
                          {isVeryNarrow ? (
                            /* Ultra-compact: initial for compact events, start time otherwise */
                            <p className="truncate text-[8px] font-bold leading-tight px-px pt-px opacity-90">
                              {isCompact ? event.title.charAt(0) : formatTimeShort(event.startTime)}
                            </p>
                          ) : (
                            <>
                              <p className={cn('truncate font-medium leading-tight', isNarrow ? 'text-[10px] pr-0' : 'text-[11px] pr-3')}>
                                {event.title}
                              </p>
                              {height >= 24 && !isCompact && (
                                <p className={cn('truncate opacity-90 leading-tight', isNarrow ? 'text-[9px]' : 'text-[10px]')}>
                                  {formatTimeShort(event.startTime)}{isNarrow ? '' : ` - ${formatTimeShort(event.endTime)}`}
                                </p>
                              )}
                              {event.subtitle && height >= 36 && !isNarrow && (
                                <p className="truncate text-[10px] font-semibold opacity-90 leading-tight">
                                  {event.subtitle}
                                </p>
                              )}
                            </>
                          )}
                          {event.capacityLabel && height >= 36 && !hideCapacity && (
                            <span className="absolute bottom-0.5 right-0.5 rounded px-1 text-[9px] font-bold opacity-90 bg-white/20">
                              {event.capacityLabel}
                            </span>
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>
              )
            })}
          </div>

        </div>
      </div>
      )}

      {/* ── Positioned popup ── */}
      {popupEvent && popupPos && (
        <PopupContainer
          popupRef={popupRef}
          popupPos={popupPos}
        >
          {renderPopup ? (
            renderPopup(popupEvent, () => { setPopupEvent(null); setPopupPos(null) })
          ) : (
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground leading-tight">{popupEvent.title}</h3>
                <div className="mt-1 flex flex-wrap gap-1">
                  {popupEvent.programType && (
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                      {popupEvent.programType}
                    </span>
                  )}
                  {popupEvent.programType === 'private' && popupEvent.partnerFirstName && (
                    <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">
                      Shared
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setPopupEvent(null); setPopupPos(null) }}
                className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="mt-3 space-y-1.5">
              {popupEvent.date && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" />
                  <span>{formatDayDate(popupEvent.date)}</span>
                </div>
              )}
              <div className={`flex items-center gap-2 text-sm text-muted-foreground ${popupEvent.date ? 'pl-[22px]' : ''}`}>
                {!popupEvent.date && <Clock className="size-3.5 shrink-0" />}
                <span>{formatTimeShort(popupEvent.startTime)} – {formatTimeShort(popupEvent.endTime)}</span>
              </div>
              {popupEvent.playerNames && popupEvent.playerNames.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-3.5 shrink-0" />
                  <span>{popupEvent.playerNames.join(', ')}</span>
                </div>
              )}
              {popupEvent.programType === 'private' && popupEvent.partnerFirstName && (
                <div className="flex items-center gap-2 text-xs text-purple-800 pl-[22px]">
                  <span>with {popupEvent.partnerFirstName} {popupEvent.partnerLastName ?? ''}</span>
                </div>
              )}
              {popupEvent.priceCents != null && popupEvent.priceCents > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="size-3.5 shrink-0" />
                  <span>{formatCurrency(popupEvent.priceCents)}/session</span>
                  {popupEvent.remainingSessions != null && popupEvent.remainingSessions > 0 && popupEvent.priceCents != null && (
                    <span className="text-xs">· {formatCurrency(popupEvent.priceCents * popupEvent.remainingSessions)}/term ({popupEvent.remainingSessions} sessions)</span>
                  )}
                </div>
              )}
              {!hideCapacity && popupEvent.spotsLeft !== undefined && popupEvent.spotsLeft !== null && popupEvent.spotsLeft <= 3 && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-3.5 shrink-0 text-danger" />
                  <span className={popupEvent.spotsLeft > 0 ? 'font-medium text-danger' : 'font-medium text-danger'}>
                    {popupEvent.spotsLeft > 0 ? `Only ${popupEvent.spotsLeft} spot${popupEvent.spotsLeft === 1 ? '' : 's'} left` : 'Full'}
                  </span>
                </div>
              )}
            </div>

            {/* Early bird banner */}
            {earlyBirdActive && popupEvent.earlyBirdPct && (popupEvent.programType === 'group' || popupEvent.programType === 'squad') && (
              <div className="mt-3 rounded-lg bg-success/5 border border-success/20 px-3 py-2 text-xs text-success font-medium">
                {popupEvent.earlyBirdPct}% off if you book the term before {formatDateShort(popupEvent.earlyBirdDeadline!)}
              </div>
            )}

            {/* Action result message */}
            {actionResult && (
              <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
                actionResult.type === 'success'
                  ? 'bg-success/5 border border-success/20 text-success'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {actionResult.message}
              </div>
            )}

            {/* Open lesson detail (parent privates) */}
            {popupEvent.bookingId && popupEvent.programType === 'private' && (
              <div className="mt-3">
                <a
                  href={`/parent/bookings/${popupEvent.bookingId}`}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
                >
                  Open lesson
                </a>
              </div>
            )}

            {/* Cancel private booking */}
            {onCancelPrivate && popupEvent.bookingId && popupEvent.programType === 'private' && (
              <div className="mt-2">
                <button
                  disabled={actionLoading}
                  onClick={async () => {
                    setActionLoading(true)
                    setActionResult(null)
                    const result = await onCancelPrivate(popupEvent.bookingId!)
                    setActionLoading(false)
                    if (result.error) {
                      setActionResult({ type: 'error', message: result.error })
                    } else {
                      setActionResult({ type: 'success', message: 'Booking cancelled' })
                      setTimeout(() => { setPopupEvent(null); setPopupPos(null); setActionResult(null) }, 1200)
                    }
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm font-medium text-danger transition-all hover:bg-danger/10 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="size-4 animate-spin" /> : 'Cancel booking'}
                </button>
              </div>
            )}

            {/* Booking/away actions */}
            <PopupActions
              event={popupEvent}
              players={players}
              enrolledPlayersMap={enrolledPlayersMap}
              sessionEnrolledMap={sessionEnrolledMap}
              eligiblePlayersMap={eligiblePlayersMap}
              selectedPlayerIds={selectedPlayerIds}
              setSelectedPlayerIds={setSelectedPlayerIds}
              actionLoading={actionLoading}
              onBookSession={onBookSession ? async (sessionId, programId, playerIds) => {
                setActionLoading(true)
                setActionResult(null)
                const result = await onBookSession(sessionId, programId, playerIds)
                setActionLoading(false)
                if (result.error) {
                  setActionResult({ type: 'error', message: result.error })
                } else {
                  setActionResult({ type: 'success', message: 'Booked!' })
                  setTimeout(() => { setPopupEvent(null); setPopupPos(null); setActionResult(null) }, 1200)
                }
              } : undefined}
              onMarkAway={onMarkAway ? async (sessionId, playerId) => {
                setActionLoading(true)
                setActionResult(null)
                const result = await onMarkAway(sessionId, playerId)
                setActionLoading(false)
                if (result.error) {
                  setActionResult({ type: 'error', message: result.error })
                } else {
                  setActionResult({ type: 'success', message: 'Marked as away' })
                  setTimeout(() => { setPopupEvent(null); setPopupPos(null); setActionResult(null) }, 1200)
                }
              } : undefined}
              onCancelSession={onCancelSession ? async (sessionId, playerId) => {
                setActionLoading(true)
                setActionResult(null)
                const result = await onCancelSession(sessionId, playerId)
                setActionLoading(false)
                if (result.error) {
                  setActionResult({ type: 'error', message: result.error })
                } else {
                  setActionResult({ type: 'success', message: 'Cancelled' })
                  setTimeout(() => { setPopupEvent(null); setPopupPos(null); setActionResult(null) }, 1200)
                }
              } : undefined}
            />
          </div>
          )}
        </PopupContainer>
      )}
    </div>
  )
}
