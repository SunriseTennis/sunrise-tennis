import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { BookingWizard } from './booking-wizard'
import { MyBookings } from './my-bookings'

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

  // Fetch all needed data in parallel
  const [
    { data: players },
    { data: coaches },
    { data: allowedCoaches },
    { data: bookings },
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
      .limit(20),
  ])

  // Build a player name map for bookings
  const playerMap = new Map((players ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private Lessons"
        description="Book a private lesson with your coach"
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

      <BookingWizard
        players={(players ?? []).map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, ball_color: p.ball_color }))}
        coaches={(coaches ?? []).map(c => ({
          id: c.id,
          name: c.name,
          is_owner: c.is_owner ?? false,
          rate_per_hour_cents: (c.hourly_rate as { private_rate_cents?: number } | null)?.private_rate_cents ?? 0,
        }))}
        allowedCoaches={(allowedCoaches ?? []).map(a => ({
          player_id: a.player_id,
          coach_id: a.coach_id,
          auto_approve: a.auto_approve ?? false,
        }))}
      />

      <MyBookings
        bookings={(bookings ?? []) as never[]}
        playerMap={Object.fromEntries(playerMap)}
      />
    </div>
  )
}
