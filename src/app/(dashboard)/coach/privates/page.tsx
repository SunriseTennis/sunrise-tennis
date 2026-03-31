import { redirect } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Users, Check, X } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { confirmPrivateBooking, declinePrivateBooking } from '../actions'
import Link from 'next/link'

export default async function CoachPrivatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const { coachId } = await requireCoach()
  if (!coachId) return redirect('/coach?error=No+coach+profile+found') as never

  const supabase = await createClient()

  // Get all private bookings for this coach's sessions
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, player_id, family_id, status, approval_status,
      price_cents, duration_minutes, booked_at,
      sessions:session_id(id, date, start_time, end_time, status),
      players:player_id(first_name, last_name, ball_color),
      families:family_id(family_name, primary_contact)
    `)
    .eq('booking_type', 'private')
    .order('booked_at', { ascending: false })
    .limit(50)

  // Filter to only this coach's sessions (RLS handles it but let's be explicit)
  const coachBookings = (bookings ?? []).filter(b => {
    const session = b.sessions as unknown as { id: string; date: string; start_time: string; end_time: string; status: string } | null
    return session != null
  })

  const pending = coachBookings.filter(b => b.approval_status === 'pending')
  const upcoming = coachBookings.filter(b => {
    const session = b.sessions as unknown as { date: string; start_time: string; status: string }
    return b.approval_status === 'approved' &&
      session.status === 'scheduled' &&
      new Date(`${session.date}T${session.start_time}`) > new Date()
  })
  const completed = coachBookings.filter(b => {
    const session = b.sessions as unknown as { status: string }
    return session.status === 'completed'
  }).slice(0, 10)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private Lessons"
        description="Manage your private lesson requests and sessions"
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decodeURIComponent(error)}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {decodeURIComponent(success)}
        </div>
      )}

      {/* Pending Requests */}
      {pending.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-orange-700">
            Pending Requests ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((b) => {
              const session = b.sessions as unknown as { date: string; start_time: string; end_time: string }
              const player = b.players as unknown as { first_name: string; last_name: string; ball_color: string }
              const family = b.families as unknown as { family_name: string; primary_contact: { name?: string; phone?: string } | null }
              return (
                <Card key={b.id} className="border-orange-200 bg-orange-50/50">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">
                        {player?.first_name} {player?.last_name}
                        {player?.ball_color && <span className="ml-1 text-xs capitalize text-muted-foreground">({player.ball_color})</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.date)} · {formatTime(session.start_time)} – {formatTime(session.end_time)} · {b.duration_minutes}min
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {family?.family_name} — {family?.primary_contact?.phone ?? 'No phone'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <form action={confirmPrivateBooking.bind(null, b.id)}>
                        <Button type="submit" size="sm" className="h-7 gap-1 text-xs">
                          <Check className="size-3" /> Confirm
                        </Button>
                      </form>
                      <form action={declinePrivateBooking.bind(null, b.id)}>
                        <Button type="submit" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-red-600 hover:bg-red-50">
                          <X className="size-3" /> Decline
                        </Button>
                      </form>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Upcoming */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState icon={Users} title="No upcoming privates" description="Confirmed bookings will appear here" compact />
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => {
              const session = b.sessions as unknown as { id: string; date: string; start_time: string; end_time: string }
              const player = b.players as unknown as { first_name: string; last_name: string; ball_color: string }
              return (
                <Link key={b.id} href={`/coach/privates/${session.id}`}>
                  <Card className="transition-colors hover:bg-accent/50">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium">{player?.first_name} {player?.last_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(session.date)} · {formatTime(session.start_time)} – {formatTime(session.end_time)}
                        </p>
                      </div>
                      <StatusBadge status="confirmed" />
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Recently Completed */}
      {completed.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Recently Completed</h2>
          <div className="space-y-2">
            {completed.map((b) => {
              const session = b.sessions as unknown as { id: string; date: string; start_time: string; end_time: string }
              const player = b.players as unknown as { first_name: string; last_name: string }
              return (
                <Link key={b.id} href={`/coach/privates/${session.id}`}>
                  <Card className="opacity-70 transition-colors hover:opacity-100">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium">{player?.first_name} {player?.last_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(session.date)} · {b.duration_minutes}min
                        </p>
                      </div>
                      <StatusBadge status="completed" />
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
