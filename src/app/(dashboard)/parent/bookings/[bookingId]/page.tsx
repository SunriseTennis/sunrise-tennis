import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { ChevronLeft, Clock, Users, User, DollarSign } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { cancelPrivateBooking } from '../actions'

export default async function ParentBookingDetail({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = await params
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Family scope
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()
  if (!userRole?.family_id) redirect('/login')

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, family_id, player_id, session_id, status, approval_status,
      cancellation_type, price_cents, duration_minutes, booking_type,
      shared_with_booking_id,
      sessions:session_id(date, start_time, end_time, status, coach_id,
        coaches:coach_id(name)
      ),
      players:player_id(first_name, last_name)
    `)
    .eq('id', bookingId)
    .eq('family_id', userRole.family_id)
    .single()

  if (!booking) notFound()

  type PartnerSummary = {
    booking_id: string
    partner_first_name: string
    partner_last_name: string
    partner_family_name: string
  }
  const { data: partnerRows } = booking.shared_with_booking_id
    ? await supabase.rpc('private_partner_summary', { booking_ids: [bookingId] })
    : { data: [] as PartnerSummary[] }
  const partner = ((partnerRows ?? []) as PartnerSummary[])[0] ?? null

  // Optional lesson note for this booking's player + session
  const { data: lessonNote } = booking.session_id && booking.player_id
    ? await supabase
        .from('lesson_notes')
        .select('id, focus, progress, notes, drills_used, video_url, next_plan, created_at')
        .eq('session_id', booking.session_id)
        .eq('player_id', booking.player_id)
        .maybeSingle()
    : { data: null }

  const session = booking.sessions as unknown as { date: string; start_time: string | null; end_time: string | null; status: string; coach_id: string | null; coaches: { name: string } | null } | null
  const player = booking.players as unknown as { first_name: string; last_name: string } | null

  const isShared = !!partner
  const isPast = !!(session?.date && new Date(`${session.date}T${session.start_time ?? '00:00'}`) < new Date())
  const isCancelled = booking.status === 'cancelled' || session?.status === 'cancelled'
  const coachShort = session?.coaches?.name?.split(' ')[0] ?? 'Coach'

  return (
    <div className="space-y-4">
      <Link href="/parent/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Bookings
      </Link>

      <div className="rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <p className="text-sm font-medium text-white/80">{isShared ? 'Shared private' : 'Private lesson'}</p>
        <h1 className="text-2xl font-bold leading-tight">
          {player ? `${player.first_name} ${player.last_name}` : '—'}
          {isShared && partner && (
            <span className="opacity-90"> &amp; {partner.partner_first_name}</span>
          )}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {session?.date ? formatDate(session.date) : ''}
          {session?.start_time ? ` · ${formatTime(session.start_time)}` : ''}
          {session?.coaches?.name ? ` · with ${coachShort}` : ''}
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={isCancelled ? 'cancelled' : (booking.approval_status === 'pending' ? 'pending' : booking.status)} />
          </div>
          {session?.start_time && session?.end_time && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-3.5 shrink-0" />
              <span>{formatTime(session.start_time)} – {formatTime(session.end_time)}</span>
              <span className="ml-auto text-foreground font-medium">{booking.duration_minutes ?? ''}min</span>
            </div>
          )}
          {player && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="size-3.5 shrink-0" />
              <span>{player.first_name} {player.last_name}</span>
            </div>
          )}
          {isShared && partner && (
            <div className="flex items-center gap-2 text-sm text-purple-800">
              <Users className="size-3.5 shrink-0" />
              <span>Shared with {partner.partner_first_name} {partner.partner_last_name} ({partner.partner_family_name})</span>
            </div>
          )}
          {booking.price_cents != null && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-semibold">{formatCurrency(booking.price_cents)}</span>
              {isShared && (
                <span className="text-xs text-muted-foreground">your half</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status-conditioned actions */}
      {!isCancelled && !isPast && (
        <form action={cancelPrivateBooking}>
          <input type="hidden" name="booking_id" value={booking.id} />
          <Button type="submit" variant="outline" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700">
            Cancel this lesson
          </Button>
        </form>
      )}

      {isCancelled && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-4 text-sm text-red-700">
            This booking is cancelled.
            {booking.cancellation_type === 'parent_late' && ' (Late cancellation — partial credit applied.)'}
          </CardContent>
        </Card>
      )}

      {/* Lesson note */}
      {lessonNote && (
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <h2 className="text-sm font-semibold">Lesson note</h2>
            {lessonNote.focus && <p><span className="text-muted-foreground">Focus:</span> {lessonNote.focus}</p>}
            {lessonNote.progress && <p><span className="text-muted-foreground">Progress:</span> {lessonNote.progress}</p>}
            {lessonNote.notes && <p><span className="text-muted-foreground">Notes:</span> {lessonNote.notes}</p>}
            {Array.isArray(lessonNote.drills_used) && lessonNote.drills_used.length > 0 && (
              <p><span className="text-muted-foreground">Drills:</span> {lessonNote.drills_used.join(', ')}</p>
            )}
            {lessonNote.video_url && (
              <p>
                <a href={lessonNote.video_url} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                  Watch lesson video
                </a>
              </p>
            )}
            {lessonNote.next_plan && <p><span className="text-muted-foreground">Next plan:</span> {lessonNote.next_plan}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
