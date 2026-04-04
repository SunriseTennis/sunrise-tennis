'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push/send'
import { validateFormData, enrolFormSchema } from '@/lib/utils/validation'
import { createCharge, getTermPrice, getSessionPrice, voidCharge, getExistingSessionCharge } from '@/lib/utils/billing'

async function getParentFamilyId(): Promise<{ userId: string; familyId: string } | null> {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) return null

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) return null
  return { userId: user.id, familyId: userRole.family_id }
}

export async function enrolInProgram(programId: string, familyId: string, formData: FormData) {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth || auth.familyId !== familyId) redirect('/login')

  // Rate limit: 5 enrollment attempts per minute per user
  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`enrol:${auth.userId}`, 5, 60_000)) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent('Too many requests. Please wait a moment.')}`)
  }

  const parsed = validateFormData(formData, enrolFormSchema)
  if (!parsed.success) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { player_id: playerId, booking_type: bookingType, payment_option: paymentOption, notes } = parsed.data

  // Verify player belongs to this family
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('family_id', familyId)
    .single()

  if (!player) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent('Player not found')}`)
  }

  // Check not already enrolled
  const { data: existing } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', programId)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .single()

  if (existing) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent('Player is already enrolled in this program')}`)
  }

  // Check capacity and get program details
  const [{ data: program }, { count: enrolledCount }] = await Promise.all([
    supabase.from('programs').select('max_capacity, name, type, term_fee_cents, per_session_cents, early_pay_discount_pct, early_bird_deadline').eq('id', programId).single(),
    supabase.from('program_roster').select('*', { count: 'exact', head: true }).eq('program_id', programId).eq('status', 'enrolled'),
  ])

  if (program?.max_capacity && enrolledCount !== null && enrolledCount >= program.max_capacity) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent('This program is full')}`)
  }

  // Add to roster
  const { error: rosterError } = await supabase
    .from('program_roster')
    .insert({
      program_id: programId,
      player_id: playerId,
      status: 'enrolled',
    })

  if (rosterError) {
    console.error('Roster enrollment failed:', rosterError.message)
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent('Enrollment failed. Please try again.')}`)
  }

  // ── Financial logic ──────────────────────────────────────────────────

  const isTermEnrollment = bookingType === 'term_enrollment' || bookingType === 'term'
  const effectivePaymentOption = isTermEnrollment ? (paymentOption || 'pay_later') : null

  // Count remaining sessions for pro-rata
  const { count: remainingSessions } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('program_id', programId)
    .gte('date', new Date().toISOString().split('T')[0])
    .eq('status', 'scheduled')

  const sessionsTotal = remainingSessions ?? 0

  // Resolve pricing (family override > program default)
  let priceCents = 0
  let discountCents = 0

  if (isTermEnrollment && effectivePaymentOption === 'pay_now') {
    // Term fee (may be overridden per family)
    const termPrice = await getTermPrice(supabase, familyId, programId, program?.type)
    const sessionPrice = await getSessionPrice(supabase, familyId, programId, program?.type)

    // Use term fee if set, otherwise per-session * remaining sessions
    priceCents = termPrice > 0 ? termPrice : sessionPrice * sessionsTotal

    // Apply early-pay discount (only if before deadline)
    const discountPct = program?.early_pay_discount_pct ?? 0
    const deadline = program?.early_bird_deadline
    const todayStr = new Date().toISOString().split('T')[0]
    const deadlineActive = !deadline || todayStr <= deadline
    if (discountPct > 0 && priceCents > 0 && deadlineActive) {
      discountCents = Math.round(priceCents * (discountPct / 100))
    }
  } else if (isTermEnrollment && effectivePaymentOption === 'pay_later') {
    // No charge now — charges created per-session via attendance
    const sessionPrice = await getSessionPrice(supabase, familyId, programId, program?.type)
    priceCents = sessionPrice * sessionsTotal
  } else if (bookingType === 'casual') {
    priceCents = await getSessionPrice(supabase, familyId, programId, program?.type)
  }
  // trial = free, priceCents stays 0

  // Create booking record with financial data
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      family_id: familyId,
      player_id: playerId,
      program_id: programId,
      booking_type: bookingType,
      status: 'confirmed',
      booked_by: auth.userId,
      notes: notes || null,
      payment_option: effectivePaymentOption,
      price_cents: priceCents,
      discount_cents: discountCents,
      sessions_total: sessionsTotal,
      sessions_charged: 0,
    })
    .select('id')
    .single()

  if (bookingError) {
    console.error('Booking record failed:', bookingError.message)
  }

  // Create charge for pay-now term enrollment
  if (isTermEnrollment && effectivePaymentOption === 'pay_now' && priceCents > 0 && booking) {
    const chargeAmount = priceCents - discountCents
    const discountDesc = discountCents > 0
      ? ` (${program?.early_pay_discount_pct}% early payment discount applied)`
      : ''

    await createCharge(supabase, {
      familyId,
      playerId,
      type: 'term_enrollment',
      sourceType: 'enrollment',
      sourceId: booking.id,
      programId,
      bookingId: booking.id,
      description: `${program?.name ?? 'Program'} - Term enrolment${discountDesc}`,
      amountCents: chargeAmount,
      status: 'confirmed',
      createdBy: auth.userId,
    })
  }

  // Create charge for casual booking
  if (bookingType === 'casual' && priceCents > 0 && booking) {
    await createCharge(supabase, {
      familyId,
      playerId,
      type: 'casual',
      sourceType: 'enrollment',
      sourceId: booking.id,
      programId,
      bookingId: booking.id,
      description: `${program?.name ?? 'Program'} - Casual session`,
      amountCents: priceCents,
      status: 'pending',
      createdBy: auth.userId,
    })
  }

  // ── Notification ─────────────────────────────────────────────────────

  try {
    // Use RPC function (SECURITY DEFINER with auth check) instead of service role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('create_booking_notification', {
      p_type: 'booking_confirmation',
      p_title: 'Booking Confirmed',
      p_body: `Successfully enrolled in ${program?.name ?? 'program'}.`,
      p_url: `/parent/programs/${programId}`,
      p_family_id: familyId,
    })

    await sendPushToUser(auth.userId, {
      title: 'Booking Confirmed',
      body: `Successfully enrolled in ${program?.name ?? 'program'}.`,
      url: `/parent/programs/${programId}`,
    })
  } catch (e) {
    console.error('Booking notification failed:', e instanceof Error ? e.message : 'Unknown error')
  }

  // Redirect — if pay_now, send to payments page
  if (isTermEnrollment && effectivePaymentOption === 'pay_now' && priceCents > 0) {
    revalidatePath(`/parent/programs/${programId}`)
    revalidatePath('/parent/programs')
    revalidatePath('/parent')
    revalidatePath('/parent/payments')
    redirect(`/parent/payments?success=${encodeURIComponent('Enrolled! Complete your payment below.')}`)
  }

  revalidatePath(`/parent/programs/${programId}`)
  revalidatePath('/parent/programs')
  revalidatePath('/parent')
  redirect(`/parent/programs/${programId}?success=${encodeURIComponent('Successfully enrolled!')}`)
}

// ── Quick book a single session from calendar popup ──────────────────────

export async function bookSession(
  sessionId: string,
  programId: string,
  playerIds: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth) return { error: 'Not authenticated' }

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`book-session:${auth.userId}`, 10, 60_000)) {
    return { error: 'Too many requests. Please wait a moment.' }
  }

  // Verify all players belong to this family
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('family_id', auth.familyId)
    .in('id', playerIds)

  if (!players || players.length !== playerIds.length) {
    return { error: 'Player not found' }
  }

  // Get session + program info
  const { data: session } = await supabase
    .from('sessions')
    .select('id, date, program_id, status')
    .eq('id', sessionId)
    .single()

  if (!session || session.status !== 'scheduled') {
    return { error: 'Session not available' }
  }

  const { data: program } = await supabase
    .from('programs')
    .select('name, type, per_session_cents')
    .eq('id', programId)
    .single()

  const sessionPrice = await getSessionPrice(supabase, auth.familyId, programId, program?.type)

  for (const playerId of playerIds) {
    // Check not already attending
    const { data: existingAttendance } = await supabase
      .from('attendances')
      .select('id')
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
      .single()

    if (existingAttendance) continue // skip if already booked

    // Create attendance record
    await supabase
      .from('attendances')
      .insert({
        session_id: sessionId,
        player_id: playerId,
        status: 'present',
      })

    // Create charge
    if (sessionPrice > 0) {
      await createCharge(supabase, {
        familyId: auth.familyId,
        playerId,
        type: 'session',
        sourceType: 'attendance',
        sourceId: sessionId,
        sessionId,
        programId,
        description: `${program?.name ?? 'Session'} - ${session.date}`,
        amountCents: sessionPrice,
        status: 'confirmed',
        createdBy: auth.userId,
      })
    }
  }

  revalidatePath('/parent/programs')
  revalidatePath('/parent')
  revalidatePath('/parent/payments')
  return {}
}

// ── Mark away / cancel attendance for a session ──────────────────────────

export async function markSessionAway(
  sessionId: string,
  playerId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth) return { error: 'Not authenticated' }

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`mark-away:${auth.userId}`, 10, 60_000)) {
    return { error: 'Too many requests. Please wait a moment.' }
  }

  // Verify player belongs to family
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('family_id', auth.familyId)
    .single()

  if (!player) return { error: 'Player not found' }

  // Update or create attendance as absent (notified absence)
  await supabase
    .from('attendances')
    .upsert(
      { session_id: sessionId, player_id: playerId, status: 'absent' },
      { onConflict: 'session_id,player_id' }
    )

  // Void the charge if one exists for this session+player
  const existingCharge = await getExistingSessionCharge(supabase, sessionId, playerId)
  if (existingCharge) {
    await voidCharge(supabase, existingCharge.id, auth.familyId)
  }

  revalidatePath('/parent/programs')
  revalidatePath('/parent')
  revalidatePath('/parent/payments')
  return {}
}

// ── Cancel a single session booking (not term enrolled) ───────────────────

export async function cancelSessionBooking(
  sessionId: string,
  playerId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth) return { error: 'Not authenticated' }

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`cancel-session:${auth.userId}`, 10, 60_000)) {
    return { error: 'Too many requests. Please wait a moment.' }
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('family_id', auth.familyId)
    .single()

  if (!player) return { error: 'Player not found' }

  // Delete attendance record
  await supabase
    .from('attendances')
    .delete()
    .eq('session_id', sessionId)
    .eq('player_id', playerId)

  // Void charge
  const existingCharge2 = await getExistingSessionCharge(supabase, sessionId, playerId)
  if (existingCharge2) {
    await voidCharge(supabase, existingCharge2.id, auth.familyId)
  }

  revalidatePath('/parent/programs')
  revalidatePath('/parent')
  revalidatePath('/parent/payments')
  return {}
}
