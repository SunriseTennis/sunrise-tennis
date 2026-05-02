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
        is_standing, standing_parent_id, shared_with_booking_id,
        session_id,
        sessions:session_id(date, start_time, end_time, status, duration_minutes,
          coaches:coach_id(id, name, is_owner)
        ),
        players:player_id(first_name, last_name),
        families:family_id(display_id, family_name)
      `)
      .eq('booking_type', 'private')
      .neq('approval_status', 'declined')
      .order('booked_at', { ascending: false })
      .limit(500),
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

  // Build a partner-player lookup so shared privates can render "A / B"
  const partnerPlayerMap = new Map<string, { firstName: string; lastName: string; familyName: string }>()
  const idToBooking = new Map<string, typeof bookings extends (infer T)[] | null ? T : never>()
  for (const b of bookings ?? []) idToBooking.set(b.id, b)
  for (const b of bookings ?? []) {
    if (!b.shared_with_booking_id) continue
    const partner = idToBooking.get(b.shared_with_booking_id)
    if (!partner) continue
    const partnerPlayer = partner.players as unknown as { first_name: string; last_name: string } | null
    const partnerFamily = partner.families as unknown as { display_id: string; family_name: string } | null
    if (partnerPlayer) {
      partnerPlayerMap.set(b.id, {
        firstName: partnerPlayer.first_name,
        lastName: partnerPlayer.last_name,
        familyName: partnerFamily?.family_name ?? '',
      })
    }
  }

  // Serialize bookings for client component
  const serializedBookings = (bookings ?? []).map(b => {
    const session = b.sessions as unknown as { date: string; start_time: string; end_time: string; status: string; coaches: { id: string; name: string; is_owner: boolean | null } | null } | null
    const player = b.players as unknown as { first_name: string; last_name: string } | null
    const family = b.families as unknown as { display_id: string; family_name: string } | null
    const partner = partnerPlayerMap.get(b.id) ?? null
    let displayStatus = b.status
    if (b.approval_status === 'pending') displayStatus = 'pending'
    if (b.approval_status === 'declined') displayStatus = 'declined'
    return {
      id: b.id,
      familyId: b.family_id,
      playerId: b.player_id,
      playerName: `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim(),
      playerFirstName: player?.first_name ?? '',
      familyDisplayId: family?.display_id ?? '',
      familyName: family?.family_name ?? '',
      coachId: session?.coaches?.id ?? '',
      coachName: session?.coaches?.name ?? '',
      coachIsOwner: !!session?.coaches?.is_owner,
      date: session?.date ?? '',
      startTime: session?.start_time ?? '',
      endTime: session?.end_time ?? '',
      sessionStatus: session?.status ?? '',
      status: displayStatus,
      approvalStatus: b.approval_status as string,
      priceCents: b.price_cents ?? 0,
      durationMinutes: b.duration_minutes ?? 30,
      bookedAt: b.booked_at,
      isStanding: !!b.is_standing,
      standingParentId: b.standing_parent_id ?? null,
      sharedWithBookingId: b.shared_with_booking_id ?? null,
      sessionId: b.session_id ?? null,
      partnerFirstName: partner?.firstName ?? null,
      partnerLastName: partner?.lastName ?? null,
      partnerFamilyName: partner?.familyName ?? null,
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
