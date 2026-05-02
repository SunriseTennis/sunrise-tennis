'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { cancelPrivateBooking } from './actions'
import { Clock, User, Users } from 'lucide-react'

interface BookingSession {
  date: string
  start_time: string | null
  end_time: string | null
  status: string
  coach_id: string | null
  coaches: { name: string } | null
}

interface Booking {
  id: string
  player_id: string
  session_id: string | null
  status: string
  approval_status: string | null
  price_cents: number | null
  duration_minutes: number | null
  booked_at: string | null
  cancellation_type: string | null
  shared_with_booking_id: string | null
  sessions: BookingSession | null
}

interface PartnerSummary {
  booking_id: string
  partner_first_name: string
  partner_last_name: string
  partner_family_name: string
}

interface Props {
  bookings: Booking[]
  playerMap: Record<string, string>
  partnerByBookingId?: Record<string, PartnerSummary>
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatFriendlyDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${SHORT_DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function formatTimeShort(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const ampm = h >= 12 ? 'pm' : 'am'
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

export function MyBookings({ bookings, playerMap, partnerByBookingId }: Props) {
  const upcoming = bookings
    .filter(b =>
      b.status !== 'cancelled' &&
      b.sessions &&
      b.sessions.status !== 'cancelled' &&
      new Date(`${b.sessions.date}T${b.sessions.start_time || '00:00'}`) > new Date()
    )
    .sort((a, b) => {
      const at = `${a.sessions?.date}T${a.sessions?.start_time ?? ''}`
      const bt = `${b.sessions?.date}T${b.sessions?.start_time ?? ''}`
      return at.localeCompare(bt)
    })

  if (upcoming.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">Upcoming Lessons</h2>
      {upcoming.map((booking) => {
        const session = booking.sessions
        const coachName = session?.coaches?.name?.split(' ')[0] ?? 'Unknown'
        const playerName = playerMap[booking.player_id] ?? 'Unknown'
        const partner = partnerByBookingId?.[booking.id]
        const isShared = !!partner

        let displayStatus = booking.status
        if (booking.approval_status === 'pending') displayStatus = 'pending'
        if (booking.approval_status === 'declined') displayStatus = 'declined'

        const cardBody = (
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1 space-y-1.5">
                {/* Row 1: Player + Status + Shared pill */}
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{playerName}</p>
                  <StatusBadge status={displayStatus} />
                  {isShared && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">Shared</span>
                  )}
                </div>
                {/* Row 2: Date */}
                {session && (
                  <p className="text-sm font-medium text-foreground">
                    {formatFriendlyDate(session.date)}
                  </p>
                )}
                {/* Row 3: Time + Duration + Coach */}
                {session && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {session.start_time ? formatTimeShort(session.start_time) : ''}
                      {session.end_time ? ` – ${formatTimeShort(session.end_time)}` : ''}
                    </span>
                    <span>{booking.duration_minutes}min</span>
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {coachName}
                    </span>
                  </div>
                )}
                {/* Row 4: Partner (when shared) */}
                {isShared && partner && (
                  <p className="flex items-center gap-1 text-xs text-purple-800">
                    <Users className="size-3" />
                    with {partner.partner_first_name} {partner.partner_last_name}
                  </p>
                )}
              </div>
              {/* Right side: Price + Cancel */}
              <div className="flex flex-col items-end gap-2 ml-3">
                {booking.price_cents != null && (
                  <p className="text-sm font-bold text-foreground">
                    ${(booking.price_cents / 100).toFixed(0)}
                  </p>
                )}
                {booking.status !== 'cancelled' && (
                  <form
                    action={cancelPrivateBooking}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input type="hidden" name="booking_id" value={booking.id} />
                    <Button type="submit" variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700">
                      Cancel
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </CardContent>
        )

        // Whole card is a link to the booking detail page when there's a session id.
        return booking.session_id ? (
          <Link key={booking.id} href={`/parent/bookings/${booking.id}`} className="block">
            <Card className="rounded-xl shadow-card transition-colors hover:bg-[#FFF6ED]/40">
              {cardBody}
            </Card>
          </Link>
        ) : (
          <Card key={booking.id} className="rounded-xl shadow-card">
            {cardBody}
          </Card>
        )
      })}
    </div>
  )
}
