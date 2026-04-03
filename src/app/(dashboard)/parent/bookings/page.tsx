import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { BookingWizard } from './booking-wizard'
import { MyBookings } from './my-bookings'
import { LessonHistory } from './lesson-history'

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

  // Date range for availability calendar
  const today = new Date()
  const threeWeeks = new Date()
  threeWeeks.setDate(today.getDate() + 21)
  const todayStr = today.toISOString().split('T')[0]
  const threeWeeksStr = threeWeeks.toISOString().split('T')[0]

  // Fetch all needed data in parallel
  const [
    { data: players },
    { data: coaches },
    { data: allowedCoaches },
    { data: bookings },
    { data: coachWindows },
    { data: coachExceptions },
    { data: allSessions },
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
      .order('name'),
    supabase
      .from('player_allowed_coaches')
      .select('player_id, coach_id, auto_approve'),
    supabase
      .from('bookings')
      .select(`
        id, player_id, session_id, booking_type, status, approval_status,
        price_cents, duration_minutes, booked_at, cancellation_type,
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
      .lte('effective_from', threeWeeksStr)
      .or(`effective_until.is.null,effective_until.gte.${todayStr}`),
    // Coach availability exceptions for 3-week window
    supabase
      .from('coach_availability_exceptions')
      .select('id, coach_id, exception_date, start_time, end_time')
      .gte('exception_date', todayStr)
      .lte('exception_date', threeWeeksStr),
    // All booked sessions for calendar display (all coaches, 3-week window)
    supabase
      .from('sessions')
      .select('id, date, start_time, end_time, coach_id, status')
      .neq('status', 'cancelled')
      .gte('date', todayStr)
      .lte('date', threeWeeksStr),
  ])

  // Fetch lesson notes (needs player IDs from first batch)
  const playerIds = (players ?? []).map(p => p.id)
  const { data: playerLessonNotes } = playerIds.length > 0
    ? await supabase
        .from('lesson_notes')
        .select('id, session_id, player_id, focus, progress, notes, drills_used, video_url, next_plan, created_at')
        .in('player_id', playerIds)
    : { data: [] as never[] }

  // Build coach data for wizard
  const coachData = (coaches ?? [])
    .map(c => ({
      id: c.id,
      name: c.name.split(' ')[0],
      is_owner: c.is_owner ?? false,
      rate_per_hour_cents: (c.hourly_rate as { private_rate_cents?: number } | null)?.private_rate_cents ?? 0,
    }))
    .filter(c => c.rate_per_hour_cents > 0)
    .sort((a, b) => b.rate_per_hour_cents - a.rate_per_hour_cents || a.name.localeCompare(b.name))

  const activeCoachIds = new Set(coachData.map(c => c.id))

  // Build player name map
  const playerMap = new Map((players ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Split bookings into upcoming and past
  const now = new Date()
  const pastBookings = (bookings ?? []).filter(b => {
    const s = b.sessions as { date: string; start_time: string | null } | null
    if (!s) return false
    if (b.status === 'cancelled') return false
    return new Date(`${s.date}T${s.start_time || '00:00'}`) <= now
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privates"
        description="Book and manage private lessons"
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

      {/* Upcoming lessons */}
      <MyBookings
        bookings={(bookings ?? []) as never[]}
        playerMap={Object.fromEntries(playerMap)}
      />

      {/* Booking wizard */}
      <BookingWizard
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
      />

      {/* Lesson history */}
      <LessonHistory
        pastBookings={pastBookings.map(b => ({
          id: b.id,
          player_id: b.player_id,
          session_id: b.session_id,
          price_cents: b.price_cents,
          duration_minutes: b.duration_minutes,
          sessions: b.sessions as {
            date: string
            start_time: string | null
            end_time: string | null
            coach_id: string | null
            coaches: { name: string } | null
          } | null,
        }))}
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
  )
}
