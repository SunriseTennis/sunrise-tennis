'use client'

import Link from 'next/link'
import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'
import { StatusBadge } from '@/components/status-badge'
import { X, Eye, Users, Clock, DollarSign } from 'lucide-react'
import { formatTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'

type Booking = {
  id: string
  familyId: string
  playerId: string
  playerName: string
  familyDisplayId: string
  familyName: string
  coachId: string
  coachName: string
  date: string
  startTime: string
  endTime: string
  sessionStatus: string
  status: string
  approvalStatus: string
  priceCents: number
  durationMinutes: number
}

// Reuse Ocean-Dawn coach palette: 5 distinct colors with dot indicator. Index by sorted coach id.
const COACH_COLORS = [
  'bg-[#2B5EA7]/15 border-[#2B5EA7]/30',
  'bg-[#E87450]/15 border-[#E87450]/30',
  'bg-[#8B78B0]/15 border-[#8B78B0]/30',
  'bg-[#F5B041]/15 border-[#F5B041]/30',
  'bg-[#6480A4]/15 border-[#6480A4]/30',
]

function bookingsToEvents(bookings: Booking[]): { events: CalendarEvent[]; coachColorByName: Record<string, string> } {
  const visible = bookings.filter(b =>
    b.date && b.startTime &&
    b.approvalStatus === 'approved' &&
    b.sessionStatus !== 'cancelled'
  )
  const uniqueCoachNames = [...new Set(visible.map(b => b.coachName).filter(Boolean))].sort()
  const coachColorByName: Record<string, string> = {}
  uniqueCoachNames.forEach((name, i) => { coachColorByName[name] = COACH_COLORS[i % COACH_COLORS.length] })

  const events: CalendarEvent[] = visible.map(b => {
    const eventDate = new Date(b.date + 'T12:00:00')
    return {
      id: b.id,
      title: `${b.playerName.split(' ')[0]} · ${b.coachName.split(' ')[0]}`,
      dayOfWeek: eventDate.getDay(),
      startTime: b.startTime,
      endTime: b.endTime,
      color: coachColorByName[b.coachName] ?? 'bg-primary/15 border-primary/30',
      date: b.date,
      bookingId: b.id,
      sessionStatus: b.sessionStatus,
      coachName: b.coachName,
      priceCents: b.priceCents,
    }
  })

  return { events, coachColorByName }
}

function PrivatePopup({ event, booking, onClose }: { event: CalendarEvent; booking: Booking | undefined; onClose: () => void }) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground leading-tight">{event.title}</h3>
          {event.sessionStatus && <StatusBadge status={event.sessionStatus} />}
        </div>
        <button
          onClick={onClose}
          className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 shrink-0" />
          <span>{formatTime(event.startTime)} – {formatTime(event.endTime)}</span>
        </div>
        {booking && (
          <div className="flex items-center gap-2">
            <Users className="size-3.5 shrink-0" />
            <span>{booking.playerName} <span className="text-xs">({booking.familyDisplayId})</span></span>
          </div>
        )}
        {event.priceCents != null && (
          <div className="flex items-center gap-2">
            <DollarSign className="size-3.5 shrink-0" />
            <span>{formatCurrency(event.priceCents)}</span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Link
          href="/admin/privates/bookings"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110"
        >
          <Eye className="size-3.5" />
          Manage bookings
        </Link>
      </div>
    </div>
  )
}

export function AdminPrivatesCalendar({ bookings }: { bookings: Booking[] }) {
  const { events } = bookingsToEvents(bookings)
  const bookingsById = new Map(bookings.map(b => [b.id, b]))

  return (
    <WeeklyCalendar
      events={events}
      hideNextTerm
      renderPopup={(event, onClose) => (
        <PrivatePopup event={event} booking={bookingsById.get(event.id)} onClose={onClose} />
      )}
    />
  )
}
