'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { validateFormData, requestPrivateFormSchema, cancelPrivateFormSchema } from '@/lib/utils/validation'
import { createCharge, voidCharge, formatChargeDescription } from '@/lib/utils/billing'
import { sendPushToUser, sendPushToAdmins } from '@/lib/push/send'
import {
  canPlayerBookCoach,
  isAutoApproved,
  getPrivatePrice,
  getAvailableSlots,
  validateBookingConstraints,
  getStandingDates,
  getEligibleParentUserIds,
} from '@/lib/utils/private-booking'

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

  // Notify coach AND admin(s) about the booking
  const notifPayload = {
    title: autoApprove ? 'Private Lesson Booked' : 'New Booking Request',
    body: `${player.first_name} - ${date} at ${formatTime12(start_time)} (${duration_minutes}min)`,
  }

  try {
    // Notify coach
    if (coach.user_id) {
      await sendPushToUser(coach.user_id, { ...notifPayload, url: '/coach/privates' })
    }
    // Notify all admins
    await sendPushToAdmins({ ...notifPayload, url: '/admin/bookings' })
  } catch {
    // Notification failure is not blocking
  }

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

  // Get the booking and verify ownership
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, family_id, session_id, price_cents, status')
    .eq('id', booking_id)
    .single()

  if (!booking || (booking.family_id !== familyId)) {
    redirect('/parent/bookings?error=Booking+not+found')
  }

  if (booking.status === 'cancelled') {
    redirect('/parent/bookings?error=Booking+already+cancelled')
  }

  // Get session details to check timing
  const { data: session } = await supabase
    .from('sessions')
    .select('date, start_time, coach_id')
    .eq('id', booking.session_id!)
    .single()

  if (!session) {
    redirect('/parent/bookings?error=Session+not+found')
  }

  // Determine if this is a late cancellation
  const sessionDateTime = new Date(`${session.date}T${session.start_time}`)
  const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
  const isLate = hoursUntil < 24

  // Get current term for cancellation tracking
  const { data: termData } = await supabase.rpc('get_current_term')
  const currentTerm = termData?.[0] ?? { term: 1, year: 2026 }

  let cancellationType = 'parent_24h'
  let creditPercent = 100 // Full credit by default

  if (isLate) {
    // Get cancellation counter
    const { data: tracker } = await supabase
      .from('cancellation_tracker')
      .select('late_cancellation_count')
      .eq('family_id', familyId)
      .eq('term', currentTerm.term)
      .eq('year', currentTerm.year)
      .single()

    const count = tracker?.late_cancellation_count ?? 0

    if (count === 0) {
      // First late cancel this term: full credit
      creditPercent = 100
    } else {
      // 2nd+ late cancel: 50% credit
      creditPercent = 50
    }

    cancellationType = 'parent_late'

    // Increment counter
    await supabase.rpc('increment_cancellation_counter', {
      target_family_id: familyId,
      target_term: currentTerm.term,
      target_year: currentTerm.year,
      counter_type: 'late_cancellation',
    })
  }

  // Void existing charge
  const { data: existingCharge } = await supabase
    .from('charges')
    .select('id, amount_cents')
    .eq('booking_id', booking_id)
    .in('status', ['pending', 'confirmed'])
    .single()

  if (existingCharge) {
    await voidCharge(supabase, existingCharge.id, familyId)

    // If partial credit (not 100%), create a charge for the non-refunded portion
    if (creditPercent < 100) {
      const chargeAmount = Math.round(existingCharge.amount_cents * (1 - creditPercent / 100))
      await createCharge(supabase, {
        familyId,
        type: 'private',
        sourceType: 'cancellation',
        sessionId: booking.session_id!,
        bookingId: booking_id,
        description: formatChargeDescription({
          label: 'Late cancellation fee',
          suffix: `${100 - creditPercent}%`,
          date: session.date,
        }),
        amountCents: chargeAmount,
        status: 'confirmed',
        createdBy: userId,
      })
    }
  }

  // Update booking
  await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_type: cancellationType,
    })
    .eq('id', booking_id)

  // Update session
  await supabase
    .from('sessions')
    .update({ status: 'cancelled', cancellation_reason: 'Parent cancelled' })
    .eq('id', booking.session_id!)

  // If this was a standing slot cancelled with 24hr+ notice, notify eligible players
  const { data: bookingFull } = await supabase
    .from('bookings')
    .select('is_standing')
    .eq('id', booking_id)
    .single()

  if (bookingFull?.is_standing && !isLate && session.coach_id) {
    try {
      const eligibleUserIds = await getEligibleParentUserIds(supabase, session.coach_id)
      for (const uid of eligibleUserIds) {
        if (uid === userId) continue // Don't notify the cancelling parent
        await sendPushToUser(uid, {
          title: 'Private Slot Available',
          body: `A private lesson slot is available on ${session.date} at ${formatTime12(session.start_time!)}`,
          url: '/parent/bookings',
        })
      }
    } catch { /* non-blocking */ }
  }

  revalidatePath('/parent/bookings')
  revalidatePath('/parent')

  const msg = creditPercent === 100
    ? 'Booking+cancelled.+Full+credit+applied.'
    : `Booking+cancelled.+${creditPercent}%25+credit+applied.`
  redirect(`/parent/bookings?success=${msg}`)
}

// ── Request Standing (Recurring) Private Booking ───────────────────────

export async function requestStandingPrivate(formData: FormData) {
  const { userId, familyId } = await getParentAuth()
  const supabase = await createClient()

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

  // Notify coach AND admin(s) about the standing booking
  try {
    const standingPayload = {
      title: 'New Standing Booking',
      body: `${player.first_name} - ${date} at ${formatTime12(start_time)} (${duration_minutes}min, weekly)`,
    }
    if (coach.user_id) {
      await sendPushToUser(coach.user_id, { ...standingPayload, url: '/coach/privates' })
    }
    await sendPushToAdmins({ ...standingPayload, url: '/admin/bookings' })
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
