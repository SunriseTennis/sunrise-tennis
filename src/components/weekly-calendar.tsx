'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, X, Clock, Users, Tag, DollarSign, CheckCircle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { getTermInfo } from '@/lib/utils/school-terms'
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
  /** Term fee in cents */
  termFeeCents?: number | null
  /** Early bird discount percentage */
  earlyBirdPct?: number | null
  /** Early bird deadline date string */
  earlyBirdDeadline?: string | null
  /** Whether family is enrolled in this program */
  isEnrolled?: boolean
  /** Spots remaining (null = unlimited) */
  spotsLeft?: number | null
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

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
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

export function WeeklyCalendar({
  events,
  onEventClick,
}: {
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
}) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [popupEvent, setPopupEvent] = useState<CalendarEvent | null>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; preferRight: boolean } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const hourHeight = 60

  const monday = useMemo(() => {
    const m = getMonday(new Date())
    return addDays(m, weekOffset * 7)
  }, [weekOffset])

  const sunday = useMemo(() => addDays(monday, 6), [monday])

  const weekDates = useMemo(() =>
    DAYS.map((_, i) => addDays(monday, i)),
  [monday])

  // Filter events to this week — date-based events only show on their date's week
  const weekEvents = useMemo(() => {
    return events.filter(e => {
      if (e.date) {
        const eventDate = new Date(e.date + 'T12:00:00')
        return eventDate >= monday && eventDate <= sunday
      }
      // Non-date events (recurring) show every week
      return true
    })
  }, [events, monday, sunday])

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
    if (popupEvent?.id === event.id) {
      setPopupEvent(null)
      setPopupPos(null)
      return
    }

    const calRect = calendarRef.current?.getBoundingClientRect()
    const btnRect = buttonEl.getBoundingClientRect()
    if (!calRect) return

    const top = btnRect.top - calRect.top + btnRect.height / 2
    const left = btnRect.right - calRect.left + 8
    const preferRight = btnRect.left - calRect.left > calRect.width / 2

    setPopupEvent(event)
    setPopupPos({ top, left, preferRight })
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
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-dawn-cream to-peach-mist/40 px-4 py-2.5">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{formatWeekRange(monday)}</span>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
              >
                Today
              </button>
            )}
          </div>
          {(() => {
            const term = getTermInfo(monday)
            return term ? (
              <span className="text-[11px] font-medium text-muted-foreground">{term}</span>
            ) : null
          })()}
        </div>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Day headers with dates */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/30">
            <div className="p-2" />
            {DAYS.map((day, i) => {
              const date = weekDates[i]
              const today = isToday(date)
              return (
                <div key={day} className={cn(
                  'border-l border-border px-1 py-2 text-center',
                  today && 'bg-primary/5',
                  !today && i >= 5 && 'bg-warm-sand/15'
                )}>
                  <span className={cn(
                    'text-[10px] font-medium uppercase tracking-wide',
                    today ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {day.slice(0, 3)}
                  </span>
                  <div className={cn(
                    'mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-xs font-bold',
                    today ? 'bg-primary text-white' : 'text-foreground'
                  )}>
                    {date.getDate()}
                  </div>
                </div>
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
                      const height = Math.max((endHour - startHour) * hourHeight, 24)
                      const isSelected = popupEvent?.id === event.id
                      const layout = collisionLayout.get(event.id) ?? { col: 0, total: 1 }
                      const widthPct = 100 / layout.total
                      const leftPct = layout.col * widthPct

                      return (
                        <button
                          key={event.id}
                          onClick={(e) => handleEventClick(event, e.currentTarget)}
                          className={cn(
                            'absolute overflow-hidden rounded-md border px-1 py-0.5 text-left transition-all',
                            isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-background brightness-110 z-10' : 'hover:brightness-110',
                            event.color ?? 'bg-primary border-primary/80 text-white'
                          )}
                          style={{
                            top,
                            height,
                            left: `calc(${leftPct}% + 1px)`,
                            width: `calc(${widthPct}% - 2px)`,
                          }}
                        >
                          {/* Enrolled indicator */}
                          {event.isEnrolled && (
                            <div className="absolute right-0.5 top-0.5">
                              <CheckCircle className="size-3 drop-shadow-sm" />
                            </div>
                          )}
                          <p className="truncate text-[11px] font-medium leading-tight pr-3">
                            {event.title}
                          </p>
                          {height >= 36 && (
                            <p className="truncate text-[10px] opacity-75 leading-tight">
                              {formatTimeShort(event.startTime)} - {formatTimeShort(event.endTime)}
                            </p>
                          )}
                          {event.subtitle && height >= 48 && (
                            <p className="truncate text-[10px] font-semibold opacity-85 leading-tight">
                              {event.subtitle}
                            </p>
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>
              )
            })}
          </div>

          {/* Empty state for weeks with no events */}
          {weekEvents.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No sessions this week
            </div>
          )}
        </div>
      </div>

      {/* ── Positioned popup ── */}
      {popupEvent && popupPos && (
        <div
          ref={popupRef}
          className="absolute z-50 w-72 animate-fade-up rounded-xl border border-border bg-white shadow-elevated"
          style={{
            top: Math.max(8, popupPos.top - 80),
            ...(popupPos.preferRight
              ? { right: 8 }
              : { left: Math.min(popupPos.left, (calendarRef.current?.offsetWidth ?? 600) - 296) }
            ),
          }}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground leading-tight">{popupEvent.title}</h3>
                {popupEvent.programType && (
                  <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                    {popupEvent.programType}
                  </span>
                )}
              </div>
              <button
                onClick={() => { setPopupEvent(null); setPopupPos(null) }}
                className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-3.5 shrink-0" />
                <span>
                  {popupEvent.date && `${formatDateShort(popupEvent.date)} · `}
                  {formatTimeShort(popupEvent.startTime)} – {formatTimeShort(popupEvent.endTime)}
                </span>
              </div>
              {popupEvent.playerNames && popupEvent.playerNames.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-3.5 shrink-0" />
                  <span>{popupEvent.playerNames.join(', ')}</span>
                </div>
              )}
              {popupEvent.priceCents != null && popupEvent.priceCents > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="size-3.5 shrink-0" />
                  <span>{formatCurrency(popupEvent.priceCents)}/session</span>
                  {popupEvent.termFeeCents != null && popupEvent.termFeeCents > 0 && (
                    <span className="text-xs">· {formatCurrency(popupEvent.termFeeCents)}/term</span>
                  )}
                </div>
              )}
              {popupEvent.spotsLeft !== undefined && popupEvent.spotsLeft !== null && popupEvent.spotsLeft <= 3 && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-3.5 shrink-0 text-danger" />
                  <span className={popupEvent.spotsLeft > 0 ? 'font-medium text-danger' : 'font-medium text-danger'}>
                    {popupEvent.spotsLeft > 0 ? `Only ${popupEvent.spotsLeft} spot${popupEvent.spotsLeft === 1 ? '' : 's'} left` : 'Full'}
                  </span>
                </div>
              )}
            </div>

            {/* Early bird banner */}
            {earlyBirdActive && popupEvent.earlyBirdPct && popupEvent.programType === 'group' && (
              <div className="mt-3 rounded-lg bg-success/5 border border-success/20 px-3 py-2 text-xs text-success font-medium">
                {popupEvent.earlyBirdPct}% off if you book the term before {formatDateShort(popupEvent.earlyBirdDeadline!)}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 space-y-2">
              {popupEvent.isEnrolled ? (
                <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 px-3 py-2.5 text-sm font-medium text-success">
                  <CheckCircle className="size-4" />
                  Enrolled
                </div>
              ) : popupEvent.spotsLeft === 0 ? (
                <div className="rounded-lg bg-muted px-3 py-2.5 text-center text-sm font-medium text-muted-foreground">
                  Program full
                </div>
              ) : null}

              {popupEvent.href && (
                <Link
                  href={popupEvent.href}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110"
                >
                  {popupEvent.isEnrolled ? 'View program' : 'Book program'}
                  <ExternalLink className="size-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
