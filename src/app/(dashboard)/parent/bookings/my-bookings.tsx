'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { cancelPrivateBooking } from './actions'
import { Clock, User } from 'lucide-react'

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
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* Row 1: Player + Status */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{playerName}</p>
                    <StatusBadge status={displayStatus} />
                  </div>
                  {/* Row 2: Date */}
                  {session && (
                    <p className="text-sm font-medium text-foreground">
                      {formatFriendlyDate(session.date)}
                    </p>
                  )}
                  {/* Row 3: Time + Duration + Coach */}
                  {session && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
                </div>
                {/* Right side: Price + Cancel */}
                <div className="flex flex-col items-end gap-2 ml-3">
                  {booking.price_cents != null && (
                    <p className="text-sm font-bold text-foreground">
                      ${(booking.price_cents / 100).toFixed(0)}
                    </p>
                  )}
                  {booking.status !== 'cancelled' && (
                    <form action={cancelPrivateBooking}>
                      <input type="hidden" name="booking_id" value={booking.id} />
                      <Button type="submit" variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700">
                        Cancel
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
