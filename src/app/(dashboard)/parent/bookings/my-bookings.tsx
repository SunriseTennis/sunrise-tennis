'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { cancelPrivateBooking } from './actions'
import { Clock, User, Users, ChevronDown, Repeat, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

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
  standing_parent_id: string | null
  is_standing: boolean | null
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
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
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

function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay()
}

interface SingleCardProps {
  booking: Booking
  playerName: string
  partner: PartnerSummary | undefined
}

/** One row — used both standalone and for the expanded list inside a series card. */
function SingleBookingCard({ booking, playerName, partner }: SingleCardProps) {
  const session = booking.sessions
  const coachName = session?.coaches?.name?.split(' ')[0] ?? 'Unknown'
  const isShared = !!partner

  let displayStatus = booking.status
  if (booking.approval_status === 'pending') displayStatus = 'pending'
  if (booking.approval_status === 'declined') displayStatus = 'declined'

  const linkContent = (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">{playerName}</p>
        <StatusBadge status={displayStatus} />
        {isShared && (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">Shared</span>
        )}
      </div>
      {session && (
        <p className="text-sm font-medium text-foreground">
          {formatFriendlyDate(session.date)}
        </p>
      )}
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
      {isShared && partner && (
        <p className="flex items-center gap-1 text-xs text-purple-800">
          <Users className="size-3" />
          with {partner.partner_first_name} {partner.partner_last_name}
        </p>
      )}
    </div>
  )

  return (
    <Card className="rounded-xl shadow-card">
      <CardContent className="flex items-start justify-between p-4">
        {booking.session_id ? (
          <Link href={`/parent/bookings/${booking.id}`} className="flex-1 min-w-0 -m-4 p-4 rounded-xl transition-colors hover:bg-[#FFF6ED]/40">
            {linkContent}
          </Link>
        ) : (
          linkContent
        )}
        <div className="flex flex-col items-end gap-2 ml-3 shrink-0">
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
      </CardContent>
    </Card>
  )
}

interface SeriesCardProps {
  groupKey: string
  bookings: Booking[]
  playerName: string
  partnerByBookingId?: Record<string, PartnerSummary>
}

/** Collapsed series card — one entry per recurring weekly slot. */
function SeriesCard({ groupKey, bookings, playerName, partnerByBookingId }: SeriesCardProps) {
  const [expanded, setExpanded] = useState(false)

  // bookings is already sorted ascending by session date.
  const first = bookings[0]
  const session = first.sessions
  if (!session) return null

  const coachName = session.coaches?.name?.split(' ')[0] ?? 'Unknown'
  const dow = dayOfWeek(session.date)
  const partner = partnerByBookingId?.[first.id]
  const isShared = !!partner
  const lastDate = bookings[bookings.length - 1].sessions?.date

  let displayStatus = first.status
  if (first.approval_status === 'pending') displayStatus = 'pending'
  if (first.approval_status === 'declined') displayStatus = 'declined'

  const seriesTotalCents = bookings.reduce((sum, b) => sum + (b.price_cents ?? 0), 0)

  return (
    <Card className="rounded-xl shadow-card">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-[#FFF6ED]/40"
          aria-expanded={expanded}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{playerName}</p>
              <StatusBadge status={displayStatus} />
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                <Repeat className="size-3" />
                Weekly
              </span>
              {isShared && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">Shared</span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {FULL_DAYS[dow]}{session.start_time ? ` · ${formatTimeShort(session.start_time)}` : ''}
              {session.end_time ? ` – ${formatTimeShort(session.end_time)}` : ''}
              {first.duration_minutes ? ` (${first.duration_minutes}min)` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="size-3" />
                {coachName}
              </span>
              <span>
                {bookings.length} session{bookings.length !== 1 ? 's' : ''}
                {lastDate ? ` through ${formatFriendlyDate(lastDate)}` : ''}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Next: <span className="font-medium text-foreground">{formatFriendlyDate(session.date)}</span>
            </p>
            {isShared && partner && (
              <p className="flex items-center gap-1 text-xs text-purple-800">
                <Users className="size-3" />
                with {partner.partner_first_name} {partner.partner_last_name}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {seriesTotalCents > 0 && (
              <p className="text-sm font-bold text-foreground">
                ${(seriesTotalCents / 100).toFixed(0)}
              </p>
            )}
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          </div>
        </button>

        {expanded && (
          <ul className="border-t border-border/40 bg-muted/10 px-4 py-2 divide-y divide-border/30" data-group-key={groupKey}>
            {bookings.map((b) => {
              const sess = b.sessions
              if (!sess?.date) return null
              return (
                <li key={b.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <Link
                    href={`/parent/bookings/${b.id}`}
                    className="flex-1 min-w-0 flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <span className="tabular-nums text-foreground">{formatFriendlyDate(sess.date)}</span>
                    {sess.start_time && (
                      <span className="text-muted-foreground tabular-nums">
                        {formatTimeShort(sess.start_time)}
                      </span>
                    )}
                  </Link>
                  {b.price_cents != null && (
                    <span className="tabular-nums text-muted-foreground">${(b.price_cents / 100).toFixed(0)}</span>
                  )}
                  {b.status !== 'cancelled' && (
                    <form action={cancelPrivateBooking}>
                      <input type="hidden" name="booking_id" value={b.id} />
                      <button
                        type="submit"
                        className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                        aria-label="Cancel"
                      >
                        <X className="size-3.5" />
                      </button>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
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

  // Group by standing-chain. Bookings without a standing chain stay solo
  // (their groupKey is just the booking id, so they end up in a 1-element group).
  // Composite key folds in player + start_time + duration to defend against
  // edge cases where two players share a parent_id pattern.
  const groupKeyOf = (b: Booking): string => {
    const root = b.standing_parent_id ?? b.id
    const sig = `${b.player_id}|${b.sessions?.start_time ?? ''}|${b.duration_minutes ?? ''}`
    return `${root}::${sig}`
  }

  const groupOrder: string[] = []
  const groups = new Map<string, Booking[]>()
  for (const b of upcoming) {
    const k = groupKeyOf(b)
    if (!groups.has(k)) {
      groups.set(k, [])
      groupOrder.push(k)
    }
    groups.get(k)!.push(b)
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">Upcoming Lessons</h2>
      {groupOrder.map((key) => {
        const groupBookings = groups.get(key)!
        const playerName = playerMap[groupBookings[0].player_id] ?? 'Unknown'
        if (groupBookings.length === 1) {
          const b = groupBookings[0]
          return (
            <SingleBookingCard
              key={b.id}
              booking={b}
              playerName={playerName}
              partner={partnerByBookingId?.[b.id]}
            />
          )
        }
        return (
          <SeriesCard
            key={key}
            groupKey={key}
            bookings={groupBookings}
            playerName={playerName}
            partnerByBookingId={partnerByBookingId}
          />
        )
      })}
    </div>
  )
}
