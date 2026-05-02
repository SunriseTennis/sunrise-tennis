import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { PrivateViews } from './private-views'

export default async function AdminPrivatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  await requireAdmin()
  const supabase = await createClient()

  const [
    { data: bookings },
    { data: families },
    { data: coaches },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, family_id, player_id, status, approval_status,
        price_cents, duration_minutes, booked_at, auto_approved,
        sessions:session_id(date, start_time, end_time, status,
          coaches:coach_id(id, name)
        ),
        players:player_id(first_name, last_name),
        families:family_id(display_id, family_name)
      `)
      .eq('booking_type', 'private')
      .neq('approval_status', 'declined')
      .order('booked_at', { ascending: false })
      .limit(100),
    supabase
      .from('families')
      .select('id, display_id, family_name, primary_contact, players(id, first_name, last_name)')
      .eq('status', 'active')
      .order('family_name'),
    supabase
      .from('coaches')
      .select('id, name, is_owner, hourly_rate')
      .eq('status', 'active')
      .order('name'),
  ])

  // Serialize bookings for client component
  const serializedBookings = (bookings ?? []).map(b => {
    const session = b.sessions as unknown as { date: string; start_time: string; end_time: string; status: string; coaches: { id: string; name: string } | null } | null
    const player = b.players as unknown as { first_name: string; last_name: string } | null
    const family = b.families as unknown as { display_id: string; family_name: string } | null
    let displayStatus = b.status
    if (b.approval_status === 'pending') displayStatus = 'pending'
    if (b.approval_status === 'declined') displayStatus = 'declined'
    return {
      id: b.id,
      familyId: b.family_id,
      playerId: b.player_id,
      playerName: `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim(),
      familyDisplayId: family?.display_id ?? '',
      familyName: family?.family_name ?? '',
      coachId: session?.coaches?.id ?? '',
      coachName: session?.coaches?.name ?? '',
      date: session?.date ?? '',
      startTime: session?.start_time ?? '',
      endTime: session?.end_time ?? '',
      sessionStatus: session?.status ?? '',
      status: displayStatus,
      approvalStatus: b.approval_status as string,
      priceCents: b.price_cents ?? 0,
      durationMinutes: b.duration_minutes ?? 30,
      bookedAt: b.booked_at,
    }
  })

  const serializedFamilies = (families ?? []).map(f => ({
    id: f.id, display_id: f.display_id, family_name: f.family_name,
    primary_contact: f.primary_contact as { name?: string } | null,
    players: ((f as unknown as { players: { id: string; first_name: string; last_name: string }[] }).players ?? []),
  }))

  const serializedCoaches = (coaches ?? []).map(c => {
    const hr = c.hourly_rate as { client_private_rate_cents?: number; private_rate_cents?: number } | null
    return {
      id: c.id, name: c.name,
      // Family-charge rate (what parents pay), with fallback to coach pay rate
      // for older rows that haven't been backfilled yet.
      rate: hr?.client_private_rate_cents ?? hr?.private_rate_cents ?? 0,
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private Lessons"
        description="View and manage all private bookings"
      />

      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          {decodeURIComponent(error)}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          {decodeURIComponent(success)}
        </div>
      )}

      <PrivateViews
        bookings={serializedBookings}
        families={serializedFamilies}
        coaches={serializedCoaches}
      />
    </div>
  )
}
