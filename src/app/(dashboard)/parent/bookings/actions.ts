'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient, getSessionUser, requireApprovedFamily } from '@/lib/supabase/server'
import { validateFormData, requestPrivateFormSchema, cancelPrivateFormSchema } from '@/lib/utils/validation'
import { createCharge, formatChargeDescription } from '@/lib/utils/billing'
import {
  canPlayerBookCoach,
  isAutoApproved,
  getPrivatePrice,
  getAvailableSlots,
  validateBookingConstraints,
  getStandingDates,
} from '@/lib/utils/private-booking'
import { performPrivateCancel } from '@/lib/private-cancel'
import { dispatchNotification } from '@/lib/notifications/dispatch'

async function getParentAuth(): Promise<{ userId: string; familyId: string }> {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) redirect('/login')
  return { userId: user.id, familyId: userRole.family_id }
}

// ── Request a Private Booking ──────────────────────────────────────────

export async function requestPrivateBooking(formData: FormData) {
  const { userId, familyId } = await getParentAuth()
  const supabase = await createClient()

  // Plan 15 Phase C — gate on approval status (redirects to /parent if not approved).
  await requireApprovedFamily()

  // Rate limit
  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`booking:${userId}`, 5, 60_000)) {
    redirect('/parent/bookings?error=Too+many+requests.+Please+wait.')
  }

  const parsed = validateFormData(formData, requestPrivateFormSchema)
  if (!parsed.success) {
    redirect(`/parent/bookings?error=${encodeURIComponent(parsed.error)}`)
  }

  const { player_id, coach_id, date, start_time, duration_minutes } = parsed.data

  // Verify player belongs to this family
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, family_id')
    .eq('id', player_id)
    .eq('family_id', familyId)
    .single()

  if (!player) {
    redirect('/parent/bookings?error=Invalid+player')
  }

  // Verify coach exists and is active
  const { data: coach } = await supabase
    .from('coaches')
    .select('id, name, is_owner, user_id')
    .eq('id', coach_id)
    .eq('status', 'active')
    .single()

  if (!coach) {
    redirect('/parent/bookings?error=Coach+not+found')
  }

  // Verify coach is in player's allowlist
  const allowed = await canPlayerBookCoach(supabase, player_id, coach_id)
  if (!allowed) {
    redirect('/parent/bookings?error=This+coach+is+not+available+for+this+player')
  }

  // Validate booking constraints
  const constraints = validateBookingConstraints(date, start_time, coach.is_owner ?? false)
  if (!constraints.valid) {
    redirect(`/parent/bookings?error=${encodeURIComponent(constraints.error!)}`)
  }

  // Verify slot is still available (race condition guard)
  const endMinutes = timeToMinutes(start_time) + duration_minutes
  const endTime = minutesToTime(endMinutes)

  const { data: conflicts } = await supabase
    .from('sessions')
    .select('id')
    .eq('coach_id', coach_id)
    .eq('date', date)
    .neq('status', 'cancelled')
    .lt('start_time', endTime)
    .gt('end_time', start_time)

  if (conflicts && conflicts.length > 0) {
    redirect('/parent/bookings?error=This+slot+is+no+longer+available')
  }

  // Calculate price (resolves family overrides via SECURITY DEFINER RPC)
  const priceCents = await getPrivatePrice(supabase, familyId, coach_id, duration_minutes)

  // Check auto-approve
  const autoApprove = await isAutoApproved(supabase, player_id, coach_id)

  // Create session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      session_type: 'private',
      date,
      start_time,
      end_time: endTime,
      coach_id,
      status: 'scheduled',
      duration_minutes,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    redirect(`/parent/bookings?error=${encodeURIComponent('Failed to create session')}`)
  }

  // Create booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      family_id: familyId,
      player_id,
      session_id: session.id,
      booking_type: 'private',
      status: autoApprove ? 'confirmed' : 'pending',
      approval_status: autoApprove ? 'approved' : 'pending',
      auto_approved: autoApprove,
      approved_by: autoApprove ? userId : null,
      approved_at: autoApprove ? new Date().toISOString() : null,
      price_cents: priceCents,
      duration_minutes,
      booked_by: userId,
    })
    .select('id')
    .single()

  if (bookingError || !booking) {
    // Clean up session
    await supabase.from('sessions').delete().eq('id', session.id)
    redirect(`/parent/bookings?error=${encodeURIComponent('Failed to create booking')}`)
  }

  // Create charge
  await createCharge(supabase, {
    familyId,
    playerId: player_id,
    type: 'private',
    sourceType: 'enrollment',
    sessionId: session.id,
    bookingId: booking.id,
    description: formatChargeDescription({
      playerName: player.first_name,
      label: `Private w/ ${coach.name}`,
      date,
    }),
    amountCents: priceCents,
    status: autoApprove ? 'confirmed' : 'pending',
    createdBy: userId,
  })

  // Notify via the rules-driven dispatcher (parent.private.requested).
  try {
    await dispatchNotification('parent.private.requested', {
      coachId: coach.id,
      playerName: player.first_name,
      date,
      time: formatTime12(start_time),
      duration: duration_minutes,
      excludeUserId: userId,
    })
  } catch { /* non-blocking */ }

  revalidatePath('/parent/bookings')
  revalidatePath('/parent')
  redirect('/parent/bookings?success=Booking+' + (autoApprove ? 'confirmed!' : 'request+submitted!'))
}

// ── Cancel a Private Booking ───────────────────────────────────────────

export async function cancelPrivateBooking(formData: FormData) {
  const { userId, familyId } = await getParentAuth()
  const supabase = await createClient()

  const parsed = validateFormData(formData, cancelPrivateFormSchema)
  if (!parsed.success) {
    redirect(`/parent/bookings?error=${encodeURIComponent(parsed.error)}`)
  }

  const { booking_id } = parsed.data

  const result = await performPrivateCancel({
    supabase,
    service: createServiceClient(),
    bookingId: booking_id,
    userId,
    familyId,
  })

  if (result.error) {
    redirect(`/parent/bookings?error=${encodeURIComponent(result.error)}`)
  }

  revalidatePath('/parent/bookings')
  revalidatePath('/parent')

  const msg = result.creditPercent === 100
    ? 'Booking+cancelled.+Full+credit+applied.'
    : `Booking+cancelled.+${result.creditPercent}%25+credit+applied.`
  redirect(`/parent/bookings?success=${msg}`)
}

// ── Request Standing (Recurring) Private Booking ───────────────────────

export async function requestStandingPrivate(formData: FormData) {
  const { userId, familyId } = await getParentAuth()
  const supabase = await createClient()

  // Plan 15 Phase C — gate on approval status.
  await requireApprovedFamily()

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`booking:${userId}`, 5, 60_000)) {
    redirect('/parent/bookings?error=Too+many+requests')
  }

  const parsed = validateFormData(formData, requestPrivateFormSchema)
  if (!parsed.success) {
    redirect(`/parent/bookings?error=${encodeURIComponent(parsed.error)}`)
  }

  const { player_id, coach_id, date, start_time, duration_minutes } = parsed.data

  // Verify player, coach, allowlist (same as one-off)
  const { data: player } = await supabase.from('players').select('id, first_name, family_id').eq('id', player_id).eq('family_id', familyId).single()
  if (!player) redirect('/parent/bookings?error=Invalid+player')

  const { data: coach } = await supabase.from('coaches').select('id, name, is_owner, user_id').eq('id', coach_id).eq('status', 'active').single()
  if (!coach) redirect('/parent/bookings?error=Coach+not+found')

  const allowed = await canPlayerBookCoach(supabase, player_id, coach_id)
  if (!allowed) redirect('/parent/bookings?error=Coach+not+available+for+this+player')

  const autoApprove = await isAutoApproved(supabase, player_id, coach_id)
  const priceCents = await getPrivatePrice(supabase, familyId, coach_id, duration_minutes)
  const endMinutes = timeToMinutes(start_time) + duration_minutes
  const endTime = minutesToTime(endMinutes)

  // Create the first session + parent standing booking
  const { data: firstSession } = await supabase
    .from('sessions')
    .insert({ session_type: 'private', date, start_time, end_time: endTime, coach_id, status: 'scheduled', duration_minutes })
    .select('id')
    .single()

  if (!firstSession) redirect('/parent/bookings?error=Failed+to+create+session')

  const { data: parentBooking } = await supabase
    .from('bookings')
    .insert({
      family_id: familyId, player_id, session_id: firstSession.id,
      booking_type: 'private', status: autoApprove ? 'confirmed' : 'pending',
      approval_status: autoApprove ? 'approved' : 'pending',
      auto_approved: autoApprove,
      approved_by: autoApprove ? userId : null,
      approved_at: autoApprove ? new Date().toISOString() : null,
      price_cents: priceCents, duration_minutes,
      booked_by: userId, is_standing: true,
    })
    .select('id')
    .single()

  if (!parentBooking) {
    await supabase.from('sessions').delete().eq('id', firstSession.id)
    redirect('/parent/bookings?error=Failed+to+create+booking')
  }

  // Create charge for first instance
  await createCharge(supabase, {
    familyId, playerId: player_id, type: 'private', sourceType: 'enrollment',
    sessionId: firstSession.id, bookingId: parentBooking.id,
    description: formatChargeDescription({
      playerName: player.first_name,
      label: `Private w/ ${coach.name}`,
      date,
    }),
    amountCents: priceCents, status: autoApprove ? 'confirmed' : 'pending', createdBy: userId,
  })

  // Generate remaining term instances
  const dayOfWeek = new Date(date + 'T12:00:00').getDay()
  const futureDates = getStandingDates(dayOfWeek, date)

  for (const futureDate of futureDates) {
    const { data: sess } = await supabase
      .from('sessions')
      .insert({ session_type: 'private', date: futureDate, start_time, end_time: endTime, coach_id, status: 'scheduled', duration_minutes })
      .select('id')
      .single()

    if (!sess) continue

    const { data: bk } = await supabase
      .from('bookings')
      .insert({
        family_id: familyId, player_id, session_id: sess.id,
        booking_type: 'private', status: autoApprove ? 'confirmed' : 'pending',
        approval_status: autoApprove ? 'approved' : 'pending',
        auto_approved: autoApprove, price_cents: priceCents, duration_minutes,
        booked_by: userId, is_standing: true, standing_parent_id: parentBooking.id,
      })
      .select('id')
      .single()

    if (bk) {
      await createCharge(supabase, {
        familyId, playerId: player_id, type: 'private', sourceType: 'enrollment',
        sessionId: sess.id, bookingId: bk.id,
        description: formatChargeDescription({
          playerName: player.first_name,
          label: `Private w/ ${coach.name}`,
          date: futureDate,
        }),
        amountCents: priceCents, status: autoApprove ? 'confirmed' : 'pending', createdBy: userId,
      })
    }
  }

  // Notify via the rules-driven dispatcher (parent.private.standing_requested).
  try {
    await dispatchNotification('parent.private.standing_requested', {
      coachId: coach.id,
      playerName: player.first_name,
      date,
      time: formatTime12(start_time),
      duration: duration_minutes,
      excludeUserId: userId,
    })
  } catch { /* non-blocking */ }

  revalidatePath('/parent/bookings')
  redirect('/parent/bookings?success=Standing+booking+' + (autoApprove ? 'confirmed!' : 'submitted!') + `+${futureDates.length + 1}+sessions+created`)
}

// ── Fetch Available Slots (called from client via server action) ───────

export async function fetchAvailableSlots(coachId: string) {
  await getParentAuth()
  const supabase = await createClient()

  const today = new Date()
  const { getCurrentOrNextTermEnd } = await import('@/lib/utils/school-terms')
  const rangeEnd = getCurrentOrNextTermEnd(today) ?? new Date(today.getTime() + 84 * 24 * 60 * 60 * 1000)

  const startDate = today.toISOString().split('T')[0]
  const endDate = rangeEnd.toISOString().split('T')[0]

  return getAvailableSlots(supabase, coachId, startDate, endDate)
}

// ── Helpers ────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTime12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}
