'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_MAP: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 } // DB day_of_week (0=Sun) -> column index (Mon-first)

const HOUR_START = 7 // 7am
const HOUR_END = 20 // 8pm

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface CalendarEvent {
  id: string
  title: string
  subtitle?: string
  dayOfWeek: number // 0=Sunday, 1=Monday, etc (DB format)
  startTime: string // HH:MM or HH:MM:SS
  endTime: string // HH:MM or HH:MM:SS
  color?: string // tailwind bg class e.g. 'bg-ball-red/20'
  href?: string
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

/** Get Monday of the week containing the given date */
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
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

function isToday(date: Date): boolean {
  const now = new Date()
  return date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
}

export function WeeklyCalendar({
  events,
  onEventClick,
}: {
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
}) {
  const [weekOffset, setWeekOffset] = useState(0)
  const hourHeight = 60 // px per hour

  const monday = useMemo(() => {
    const m = getMonday(new Date())
    return addDays(m, weekOffset * 7)
  }, [weekOffset])

  const weekDates = useMemo(() =>
    DAYS.map((_, i) => addDays(monday, i)),
  [monday])

  // Find actual time range used by events to avoid empty space
  const { minHour, maxHour } = useMemo(() => {
    if (events.length === 0) return { minHour: HOUR_START, maxHour: HOUR_END }
    let min = HOUR_END
    let max = HOUR_START
    for (const e of events) {
      const start = parseTime(e.startTime)
      const end = parseTime(e.endTime)
      if (Math.floor(start) < min) min = Math.floor(start)
      if (Math.ceil(end) > max) max = Math.ceil(end)
    }
    return { minHour: Math.max(min - 1, 0), maxHour: Math.min(max + 1, 24) }
  }, [events])

  const visibleHours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* Week navigation header */}
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-dawn-cream to-peach-mist/40 px-4 py-2.5">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
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
                  {events
                    .filter((e) => DAY_MAP[e.dayOfWeek] === colIdx)
                    .map((event) => {
                      const startHour = parseTime(event.startTime)
                      const endHour = parseTime(event.endTime)
                      const top = (startHour - minHour) * hourHeight
                      const height = Math.max((endHour - startHour) * hourHeight, 24)

                      return (
                        <button
                          key={event.id}
                          onClick={() => {
                            if (event.href) {
                              window.location.href = event.href
                            }
                            onEventClick?.(event)
                          }}
                          className={cn(
                            'absolute left-0.5 right-0.5 overflow-hidden rounded-md border px-1.5 py-0.5 text-left transition-opacity hover:opacity-80',
                            event.color ?? 'bg-primary border-primary/80 text-white'
                          )}
                          style={{ top, height }}
                        >
                          <p className="truncate text-[11px] font-medium leading-tight">
                            {event.title}
                          </p>
                          {height >= 36 && (
                            <p className="truncate text-[10px] opacity-75 leading-tight">
                              {formatTimeShort(event.startTime)} - {formatTimeShort(event.endTime)}
                            </p>
                          )}
                          {event.subtitle && (
                            <p className="truncate text-[10px] font-semibold opacity-85 leading-tight">
                              {event.subtitle}
                            </p>
                          )}
                        </button>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
