import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { ImageHero } from '@/components/image-hero'
import { AvailabilityCalendar } from './availability-calendar'
import { MyBookings } from './my-bookings'
import { LessonHistory } from './lesson-history'
import { getCurrentOrNextTermEnd } from '@/lib/utils/school-terms'
import { WarmToast } from '@/components/warm-toast'

export default async function ParentBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Get parent's family
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) redirect('/login')
  const familyId = userRole.family_id

  // Date range for availability calendar — extend to end of current/next term
  const today = new Date()
  const termEnd = getCurrentOrNextTermEnd(today)
  const rangeEnd = termEnd ?? new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000) // fallback 3 weeks
  const todayStr = today.toISOString().split('T')[0]
  const rangeEndStr = rangeEnd.toISOString().split('T')[0]

  // Fetch all needed data in parallel
  const [
    { data: players },
    { data: coaches },
    { data: allowedCoaches },
    { data: bookings },
    { data: coachWindows },
    { data: coachExceptions },
    { data: allSessions },
    { data: balance },
    { data: overrides },
  ] = await Promise.all([
    supabase
      .from('players')
      .select('id, first_name, last_name, ball_color')
      .eq('family_id', familyId)
      .eq('status', 'active')
      .order('first_name'),
    supabase
      .from('coaches')
      .select('id, name, is_owner, hourly_rate')
      .eq('status', 'active')
      .eq('delivers_privates', true)
      .order('name'),
    supabase
      .from('player_allowed_coaches')
      .select('player_id, coach_id, auto_approve'),
    supabase
      .from('bookings')
      .select(`
        id, player_id, session_id, booking_type, status, approval_status,
        price_cents, duration_minutes, booked_at, cancellation_type,
        shared_with_booking_id, standing_parent_id, is_standing,
        sessions:session_id(date, start_time, end_time, coach_id, status,
          coaches:coach_id(name)
        )
      `)
      .eq('family_id', familyId)
      .eq('booking_type', 'private')
      .order('booked_at', { ascending: false })
      .limit(50),
    // Coach availability windows for calendar
    supabase
      .from('coach_availability')
      .select('id, coach_id, day_of_week, start_time, end_time, effective_from, effective_until')
      .lte('effective_from', rangeEndStr)
      .or(`effective_until.is.null,effective_until.gte.${todayStr}`),
    // Coach availability exceptions for 3-week window
    supabase
      .from('coach_availability_exceptions')
      .select('id, coach_id, exception_date, start_time, end_time')
      .gte('exception_date', todayStr)
      .lte('exception_date', rangeEndStr),
    // All booked sessions for calendar display (all coaches, 3-week window)
    supabase
      .from('sessions')
      .select('id, date, start_time, end_time, coach_id, status')
      .neq('status', 'cancelled')
      .gte('date', todayStr)
      .lte('date', rangeEndStr),
    supabase
      .from('family_balance')
      .select('confirmed_balance_cents')
      .eq('family_id', familyId)
      .single(),
    // Per-coach private-rate overrides for this family (RLS scopes to own family)
    supabase
      .from('family_pricing')
      .select('coach_id, per_session_cents, valid_until')
      .eq('family_id', familyId)
      .eq('program_type', 'private')
      .lte('valid_from', todayStr)
      .or(`valid_until.is.null,valid_until.gte.${todayStr}`)
      .not('per_session_cents', 'is', null),
  ])

  const confirmedCreditCents = Math.max(0, balance?.confirmed_balance_cents ?? 0)

  // Resolve partner-family info for shared bookings.
  type PartnerSummary = {
    booking_id: string
    partner_first_name: string
    partner_last_name: string
    partner_family_name: string
  }
  const sharedBookingIds = (bookings ?? [])
    .filter(b => b.shared_with_booking_id)
    .map(b => b.id)
  const { data: partnerRows } = sharedBookingIds.length > 0
    ? await supabase.rpc('private_partner_summary', { booking_ids: sharedBookingIds })
    : { data: [] as PartnerSummary[] }
  const partnerByBookingId = new Map<string, PartnerSummary>()
  for (const r of (partnerRows ?? []) as PartnerSummary[]) partnerByBookingId.set(r.booking_id, r)

  // Build per-coach override map. Per-coach rows win over coach_id IS NULL rows.
  // Treats per_session_cents as the per-30min rate for privates.
  const privateOverrideMap = new Map<string, { per30Cents: number; validUntil: string | null }>()
  let allPrivatesOverride: { per30Cents: number; validUntil: string | null } | null = null
  for (const row of overrides ?? []) {
    if (row.per_session_cents == null) continue
    if (row.coach_id) {
      privateOverrideMap.set(row.coach_id, { per30Cents: row.per_session_cents, validUntil: row.valid_until })
    } else if (!allPrivatesOverride) {
      allPrivatesOverride = { per30Cents: row.per_session_cents, validUntil: row.valid_until }
    }
  }

  // Fetch lesson notes (needs player IDs from first batch)
  const playerIds = (players ?? []).map(p => p.id)
  const { data: playerLessonNotes } = playerIds.length > 0
    ? await supabase
        .from('lesson_notes')
        .select('id, session_id, player_id, focus, progress, notes, drills_used, video_url, next_plan, created_at')
        .in('player_id', playerIds)
    : { data: [] as never[] }

  // Build coach data
  const coachData = (coaches ?? [])
    .map(c => ({
      id: c.id,
      name: c.name.split(' ')[0],
      is_owner: c.is_owner ?? false,
      rate_per_hour_cents: (c.hourly_rate as { client_private_rate_cents?: number; private_rate_cents?: number } | null)?.client_private_rate_cents
        ?? (c.hourly_rate as { private_rate_cents?: number } | null)?.private_rate_cents ?? 0,
    }))
    .filter(c => c.rate_per_hour_cents > 0)
    .sort((a, b) => b.rate_per_hour_cents - a.rate_per_hour_cents || a.name.localeCompare(b.name))

  const activeCoachIds = new Set(coachData.map(c => c.id))

  // Build player name map
  const playerMap = new Map((players ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Split bookings
  const now = new Date()
  const allBookings = (bookings ?? []).map(b => ({
    id: b.id,
    player_id: b.player_id,
    session_id: b.session_id,
    status: b.status,
    approval_status: b.approval_status,
    price_cents: b.price_cents,
    duration_minutes: b.duration_minutes,
    cancellation_type: b.cancellation_type,
    sessions: b.sessions as {
      date: string
      start_time: string | null
      end_time: string | null
      coach_id: string | null
      status: string
      coaches: { name: string } | null
    } | null,
  }))

  const pastBookings = allBookings.filter(b => {
    if (!b.sessions) return false
    if (b.status === 'cancelled') return false
    return new Date(`${b.sessions.date}T${b.sessions.start_time || '00:00'}`) <= now
  })

  // Slot-taken detection for the re-book button on a cancelled-self booking.
  // We mark a slot taken when a different scheduled session occupies the same
  // coach + date + start_time (e.g. parent self-cancelled, admin re-booked
  // someone else into the slot). Shared self-cancels are detected by partner
  // presence + coverage by the still-scheduled session below.
  const slotTakenByBookingId: Record<string, boolean> = {}
  for (const b of allBookings) {
    if (b.status !== 'cancelled') continue
    if (b.cancellation_type !== 'parent_24h' && b.cancellation_type !== 'parent_late') continue
    if (!b.sessions || !b.session_id) continue
    const s = b.sessions
    if (!s.date || !s.start_time || !s.coach_id) continue
    const conflict = (allSessions ?? []).some(other =>
      other.id !== b.session_id &&
      other.coach_id === s.coach_id &&
      other.date === s.date &&
      other.start_time === s.start_time,
    )
    slotTakenByBookingId[b.id] = conflict
  }

  return (
    <div className="space-y-6">
      <ImageHero>
        <div>
          <p className="text-sm font-medium text-white/80">Private Lessons</p>
          <h1 className="text-2xl font-bold">Book &amp; Manage</h1>
          <p className="mt-1 text-sm text-white/70">1-on-1 coaching with your favourite coaches</p>
        </div>
      </ImageHero>

      {error && (
        <WarmToast variant="danger">{decodeURIComponent(error)}</WarmToast>
      )}
      {success && (
        <WarmToast variant="success">{decodeURIComponent(success)}</WarmToast>
      )}

      {/* Calendar — default "Your Privates", coach tabs for availability */}
      <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
      <AvailabilityCalendar
        players={(players ?? []).map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, ball_color: p.ball_color }))}
        coaches={coachData}
        allowedCoaches={(allowedCoaches ?? []).map(a => ({
          player_id: a.player_id,
          coach_id: a.coach_id,
          auto_approve: a.auto_approve ?? false,
        }))}
        coachWindows={(coachWindows ?? [])
          .filter(w => activeCoachIds.has(w.coach_id))
          .map(w => ({
            coach_id: w.coach_id,
            day_of_week: w.day_of_week,
            start_time: w.start_time,
            end_time: w.end_time,
          }))}
        coachExceptions={(coachExceptions ?? [])
          .filter(e => activeCoachIds.has(e.coach_id))
          .map(e => ({
            coach_id: e.coach_id,
            exception_date: e.exception_date,
            start_time: e.start_time,
            end_time: e.end_time,
          }))}
        bookedSessions={(allSessions ?? [])
          .filter(s => activeCoachIds.has(s.coach_id!))
          .map(s => ({
            coach_id: s.coach_id!,
            date: s.date,
            start_time: s.start_time,
            end_time: s.end_time,
          }))}
        existingBookings={allBookings}
        rangeEndDate={rangeEndStr}
        playerMap={Object.fromEntries(playerMap)}
        confirmedCreditCents={confirmedCreditCents}
        privateRateOverrides={Object.fromEntries(privateOverrideMap)}
        allPrivatesOverride={allPrivatesOverride}
        partnerByBookingId={Object.fromEntries(partnerByBookingId)}
        slotTakenByBookingId={slotTakenByBookingId}
      />
      </div>

      {/* Upcoming lessons (cancellable) */}
      <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
      <MyBookings
        bookings={(bookings ?? []) as never[]}
        playerMap={Object.fromEntries(playerMap)}
        partnerByBookingId={Object.fromEntries(partnerByBookingId)}
      />
      </div>

      {/* Lesson history */}
      <div className="animate-fade-up" style={{ animationDelay: '240ms' }}>
      <LessonHistory
        pastBookings={pastBookings}
        lessonNotes={(playerLessonNotes ?? []).map(n => ({
          id: n.id,
          session_id: n.session_id,
          player_id: n.player_id,
          focus: n.focus,
          progress: n.progress,
          notes: n.notes,
          next_plan: n.next_plan,
          drills_used: n.drills_used,
          video_url: n.video_url,
          created_at: n.created_at,
        }))}
        players={(players ?? []).map(p => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
        }))}
      />
      </div>
    </div>
  )
}
