'use client'

import Link from 'next/link'
import { WeeklyCalendar, type CalendarEvent } from '@/components/weekly-calendar'
import { StatusBadge } from '@/components/status-badge'
import { X, Eye, Users, Clock, DollarSign, UserMinus } from 'lucide-react'
import { formatTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'

// Imports the canonical Booking shape from the parent view.
import type { Booking } from './private-views'

// Reuse Ocean-Dawn coach palette: 5 distinct colors with dot indicator. Index by sorted coach id.
const COACH_COLORS = [
  'bg-[#2B5EA7]/15 border-[#2B5EA7]/30',
  'bg-[#E87450]/15 border-[#E87450]/30',
  'bg-[#8B78B0]/15 border-[#8B78B0]/30',
  'bg-[#F5B041]/15 border-[#F5B041]/30',
  'bg-[#6480A4]/15 border-[#6480A4]/30',
]

function bookingsToEvents(bookings: Booking[]): { events: CalendarEvent[]; coachColorByName: Record<string, string>; sessionTotals: Map<string, number> } {
  const visible = bookings.filter(b =>
    b.date && b.startTime &&
    b.approvalStatus === 'approved' &&
    b.sessionStatus !== 'cancelled'
  )
  const uniqueCoachNames = [...new Set(visible.map(b => b.coachName).filter(Boolean))].sort()
  const coachColorByName: Record<string, string> = {}
  uniqueCoachNames.forEach((name, i) => { coachColorByName[name] = COACH_COLORS[i % COACH_COLORS.length] })

  // Sum prices per session (both family halves on a shared private).
  const sessionTotals = new Map<string, number>()
  for (const b of visible) {
    if (!b.sessionId) continue
    sessionTotals.set(b.sessionId, (sessionTotals.get(b.sessionId) ?? 0) + (b.priceCents ?? 0))
  }

  // Dedupe shared privates: only render one event per session_id.
  const seenSessionIds = new Set<string>()

  const events: CalendarEvent[] = visible.flatMap(b => {
    if (b.sessionId) {
      if (seenSessionIds.has(b.sessionId)) return []
      seenSessionIds.add(b.sessionId)
    }
    const eventDate = new Date(b.date + 'T12:00:00')
    const playerLabel = b.partnerFirstName
      ? `${b.playerFirstName} / ${b.partnerFirstName}`
      : (b.playerFirstName || b.playerName.split(' ')[0])
    const totalCents = b.sessionId ? (sessionTotals.get(b.sessionId) ?? b.priceCents) : b.priceCents
    return [{
      id: b.id,
      title: `${playerLabel} · ${b.coachName.split(' ')[0]}`,
      dayOfWeek: eventDate.getDay(),
      startTime: b.startTime,
      endTime: b.endTime,
      color: b.partnerFirstName
        ? 'bg-purple-200 border-purple-400'
        : coachColorByName[b.coachName] ?? 'bg-primary/15 border-primary/30',
      date: b.date,
      bookingId: b.id,
      sessionStatus: b.sessionStatus,
      coachName: b.coachName,
      priceCents: totalCents,
    }]
  })

  return { events, coachColorByName, sessionTotals }
}

function PrivatePopup({
  event,
  booking,
  partner,
  onClose,
  onConvert,
}: {
  event: CalendarEvent
  booking: Booking | undefined
  partner: Booking | undefined
  onClose: () => void
  onConvert?: () => void
}) {
  const isShared = !!partner
  const ownPrice = booking?.priceCents ?? 0
  const partnerPrice = partner?.priceCents ?? 0
  const totalPrice = isShared ? ownPrice + partnerPrice : ownPrice

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold text-foreground leading-tight">{event.title}</h3>
            {isShared && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">Shared</span>
            )}
          </div>
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
          <div className="flex items-start gap-2">
            <Users className="size-3.5 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span>{booking.playerName} <span className="text-xs">({booking.familyDisplayId})</span></span>
              {partner && (
                <span>{partner.playerName} <span className="text-xs">({partner.familyDisplayId})</span></span>
              )}
            </div>
          </div>
        )}
        {totalPrice > 0 && (
          <div className="flex items-center gap-2">
            <DollarSign className="size-3.5 shrink-0" />
            {isShared ? (
              <span>{formatCurrency(totalPrice)} total · {formatCurrency(ownPrice)} + {formatCurrency(partnerPrice)}</span>
            ) : (
              <span>{formatCurrency(totalPrice)}</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {booking?.sessionId && (
          <Link
            href={`/admin/sessions/${booking.sessionId}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110"
          >
            <Eye className="size-3.5" />
            Open session
          </Link>
        )}
        {isShared && booking?.sessionStatus === 'scheduled' && onConvert && (
          <button
            type="button"
            onClick={onConvert}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-all hover:bg-amber-100"
          >
            <UserMinus className="size-3.5" />
            Convert to solo
          </button>
        )}
      </div>
    </div>
  )
}

export function AdminPrivatesCalendar({
  bookings,
  onConvert,
}: {
  bookings: Booking[]
  onConvert?: (sessionId: string) => void
}) {
  const { events } = bookingsToEvents(bookings)
  const bookingsById = new Map(bookings.map(b => [b.id, b]))
  // partner lookup keyed by primary booking id
  const partnerById = new Map<string, Booking>()
  for (const b of bookings) {
    if (b.sharedWithBookingId) {
      const partner = bookingsById.get(b.sharedWithBookingId)
      if (partner) partnerById.set(b.id, partner)
    }
  }

  return (
    <WeeklyCalendar
      events={events}
      hideNextTerm
      renderPopup={(event, onClose) => {
        const booking = bookingsById.get(event.id)
        const partner = partnerById.get(event.id)
        return (
          <PrivatePopup
            event={event}
            booking={booking}
            partner={partner}
            onClose={onClose}
            onConvert={onConvert && booking?.sessionId ? () => { onConvert(booking.sessionId!); onClose() } : undefined}
          />
        )
      }}
    />
  )
}
