'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { cancelPrivateBooking } from './actions'

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
  sessions: BookingSession | null
}

interface Props {
  bookings: Booking[]
  playerMap: Record<string, string>
}

export function MyBookings({ bookings, playerMap }: Props) {
  const upcoming = bookings.filter(b =>
    b.status !== 'cancelled' &&
    b.sessions &&
    new Date(`${b.sessions.date}T${b.sessions.start_time || '00:00'}`) > new Date()
  )

  if (upcoming.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">Upcoming Lessons</h2>
      {upcoming.map((booking) => {
        const session = booking.sessions
        const coachName = session?.coaches?.name?.split(' ')[0] ?? 'Unknown'
        const playerName = playerMap[booking.player_id] ?? 'Unknown'

        let displayStatus = booking.status
        if (booking.approval_status === 'pending') displayStatus = 'pending'
        if (booking.approval_status === 'declined') displayStatus = 'declined'

        return (
          <Card key={booking.id} className="rounded-xl shadow-card">
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{playerName}</p>
                  <StatusBadge status={displayStatus} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {session
                    ? `${formatDate(session.date)} · ${session.start_time ? formatTime(session.start_time) : ''} · ${booking.duration_minutes}min · ${coachName}`
                    : 'Session details unavailable'}
                </p>
                {booking.price_cents != null && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    ${(booking.price_cents / 100).toFixed(2)}
                  </p>
                )}
              </div>

              {booking.status !== 'cancelled' && (
                <form action={cancelPrivateBooking}>
                  <input type="hidden" name="booking_id" value={booking.id} />
                  <Button type="submit" variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700">
                    Cancel
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
