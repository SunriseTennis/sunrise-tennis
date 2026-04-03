'use client'

import { useMemo } from 'react'
import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'
import { cn } from '@/lib/utils/cn'
import type {
  AvailabilityWindow,
  AvailabilityException,
  BookedSession,
  TimeSlot,
} from '@/lib/utils/private-booking'

interface Coach {
  id: string
  name: string
  rate_per_hour_cents: number
}

interface Props {
  coaches: Coach[]
  selectedCoachId: string
  onCoachChange: (coachId: string) => void
  coachWindows: (AvailabilityWindow & { coach_id: string })[]
  coachExceptions: (AvailabilityException & { coach_id: string })[]
  bookedSessions: (BookedSession & { coach_id: string })[]
  duration: 30 | 60
  onSlotSelect: (slot: TimeSlot) => void
}

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

export function AvailabilityCalendar({
  coaches,
  selectedCoachId,
  onCoachChange,
  coachWindows,
  coachExceptions,
  bookedSessions,
  duration,
  onSlotSelect,
}: Props) {
  // Filter data for the selected coach
  const windows = useMemo(
    () => coachWindows.filter(w => w.coach_id === selectedCoachId),
    [coachWindows, selectedCoachId]
  )
  const exceptions = useMemo(
    () => coachExceptions.filter(e => e.coach_id === selectedCoachId),
    [coachExceptions, selectedCoachId]
  )
  const sessions = useMemo(
    () => bookedSessions.filter(s => s.coach_id === selectedCoachId),
    [bookedSessions, selectedCoachId]
  )

  // Generate calendar events for a 4-week window (covers the 3-week booking limit)
  const events = useMemo(() => {
    const today = new Date()
    const calEvents: CalendarEvent[] = []
    let eventId = 0

    // Generate events for each day in the next 4 weeks
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

        // Generate slots at the selected duration
        for (let slotStart = windowStart; slotStart + duration <= windowEnd; slotStart += 30) {
          const slotEnd = slotStart + duration
          const startTime = minutesToTime(slotStart)
          const endTime = minutesToTime(slotEnd)

          // Check if any 30-min sub-slot within this duration is blocked by exception
          let blocked = false
          for (let sub = slotStart; sub < slotEnd; sub += 30) {
            const subEnd = sub + 30
            if (dayExceptions.some(e => {
              if (!e.start_time || !e.end_time) return false
              const excStart = timeToMinutes(e.start_time)
              const excEnd = timeToMinutes(e.end_time)
              return sub < excEnd && subEnd > excStart
            })) {
              blocked = true
              break
            }
          }
          if (blocked) continue

          // Check if any 30-min sub-slot is booked
          let isBooked = false
          for (let sub = slotStart; sub < slotEnd; sub += 30) {
            const subEnd = sub + 30
            if (sessions.some(s => {
              if (s.date !== dateStr) return false
              if (!s.start_time || !s.end_time) return false
              const sessStart = timeToMinutes(s.start_time)
              const sessEnd = timeToMinutes(s.end_time)
              return sub < sessEnd && subEnd > sessStart
            })) {
              isBooked = true
              break
            }
          }

          eventId++
          if (isBooked) {
            calEvents.push({
              id: `booked-${eventId}`,
              title: 'Booked',
              dayOfWeek,
              startTime,
              endTime,
              date: dateStr,
              color: 'bg-muted/60 border-border text-muted-foreground opacity-60',
            })
          } else {
            calEvents.push({
              id: `avail-${eventId}`,
              title: formatTimeShort(startTime),
              dayOfWeek,
              startTime,
              endTime,
              date: dateStr,
              color: 'bg-primary/15 border-primary/30 text-primary hover:bg-primary/25',
              selectable: true,
            })
          }

          // For 60min slots, advance by 60 not 30 to avoid overlapping events
          if (duration === 60) slotStart += 30
        }
      }
    }

    return calEvents
  }, [windows, exceptions, sessions, duration])

  const handleEventClick = (event: CalendarEvent) => {
    // Only handle clicks on available (selectable) events
    if (!event.selectable || !event.date) return
    onSlotSelect({
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
    })
  }

  return (
    <div className="space-y-3">
      {/* Coach toggle pills */}
      {coaches.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {coaches.map((coach) => (
            <button
              key={coach.id}
              type="button"
              onClick={() => onCoachChange(coach.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                selectedCoachId === coach.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {coach.name}
            </button>
          ))}
        </div>
      )}

      <WeeklyCalendar events={events} onEventClick={handleEventClick} />
    </div>
  )
}
