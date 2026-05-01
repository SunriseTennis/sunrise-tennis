'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push/send'
import { validateFormData, enrolFormSchema } from '@/lib/utils/validation'
import { createCharge, getTermPrice, voidCharge, getExistingSessionCharge, formatChargeDescription } from '@/lib/utils/billing'
import { getTermLabel } from '@/lib/utils/school-terms'
import { isEligible, getActiveEarlyBird } from '@/lib/utils/eligibility'
import { getMorningSquadSessionPrice } from '@/lib/utils/morning-squad-pricing'

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
    .select('id, first_name, gender, classifications, track')
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
    supabase.from('programs').select('max_capacity, name, type, day_of_week, term_fee_cents, per_session_cents, early_pay_discount_pct, early_bird_deadline, early_pay_discount_pct_tier2, early_bird_deadline_tier2, allowed_classifications, gender_restriction, track_required').eq('id', programId).single(),
    supabase.from('program_roster').select('*', { count: 'exact', head: true }).eq('program_id', programId).eq('status', 'enrolled'),
  ])

  // Server-side eligibility gate (mirrors client filter, also blocks API-level abuse)
  if (program) {
    const eligibility = isEligible(
      { gender: player.gender as 'male' | 'female' | 'non_binary' | null, classifications: player.classifications, track: player.track },
      { day_of_week: program.day_of_week, allowed_classifications: program.allowed_classifications, gender_restriction: program.gender_restriction, track_required: program.track_required },
    )
    if (!eligibility.ok) {
      redirect(`/parent/programs/${programId}?error=${encodeURIComponent(eligibility.message ?? 'Player is not eligible for this program')}`)
    }
  }

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
  let activeDiscountPct = 0

  if (isTermEnrollment && effectivePaymentOption === 'pay_now') {
    // Term fee (may be overridden per family)
    const termPrice = await getTermPrice(supabase, familyId, programId, program?.type)
    const sessionPrice = await getMorningSquadSessionPrice(
      supabase, familyId, programId, program?.type, playerId,
    )

    // Use term fee if set, otherwise per-session * remaining sessions
    priceCents = termPrice > 0 ? termPrice : sessionPrice * sessionsTotal

    // Apply tiered early-pay discount (15% tier 1, 10% tier 2, 0% expired)
    const eb = getActiveEarlyBird({
      early_pay_discount_pct: program?.early_pay_discount_pct ?? null,
      early_bird_deadline: program?.early_bird_deadline ?? null,
      early_pay_discount_pct_tier2: program?.early_pay_discount_pct_tier2 ?? null,
      early_bird_deadline_tier2: program?.early_bird_deadline_tier2 ?? null,
    })
    if (eb.pct > 0 && priceCents > 0) {
      discountCents = Math.round(priceCents * (eb.pct / 100))
      activeDiscountPct = eb.pct
    }
  } else if (isTermEnrollment && effectivePaymentOption === 'pay_later') {
    // No charge now — charges created per-session via attendance
    const sessionPrice = await getMorningSquadSessionPrice(
      supabase, familyId, programId, program?.type, playerId,
    )
    priceCents = sessionPrice * sessionsTotal
  } else if (bookingType === 'casual') {
    priceCents = await getMorningSquadSessionPrice(
      supabase, familyId, programId, program?.type, playerId,
    )
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

    await createCharge(supabase, {
      familyId,
      playerId,
      type: 'term_enrollment',
      sourceType: 'enrollment',
      sourceId: booking.id,
      programId,
      bookingId: booking.id,
      description: formatChargeDescription({
        playerName: player.first_name,
        label: `${program?.name ?? 'Program'} - Term enrolment`,
        suffix: discountCents > 0 ? `${activeDiscountPct}% early-pay discount` : null,
        term: getTermLabel(new Date()),
      }),
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
      description: formatChargeDescription({
        playerName: player.first_name,
        label: `${program?.name ?? 'Program'} - Casual session`,
        term: getTermLabel(new Date()),
      }),
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

  // Verify all players belong to this family — pull eligibility fields too
  // so we can gate per-player against the program's gender/track/classification.
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, gender, classifications, track')
    .eq('family_id', auth.familyId)
    .in('id', playerIds)

  if (!players || players.length !== playerIds.length) {
    return { error: 'Player not found' }
  }
  const playerNameById = new Map(players.map(p => [p.id, p.first_name]))

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
    .select('name, type, per_session_cents, day_of_week, allowed_classifications, gender_restriction, track_required')
    .eq('id', programId)
    .single()

  // Server-side eligibility gate: the client filter hides ineligible players
  // but anyone hitting this RPC directly must still be blocked. Mirrors the
  // gate on `enrolInProgram`.
  if (program) {
    for (const p of players) {
      const result = isEligible(
        { gender: p.gender as 'male' | 'female' | 'non_binary' | null, classifications: p.classifications, track: p.track },
        { day_of_week: program.day_of_week, allowed_classifications: program.allowed_classifications, gender_restriction: program.gender_restriction, track_required: program.track_required },
      )
      if (!result.ok) {
        return { error: `${p.first_name}: ${result.message ?? 'not eligible for this program'}` }
      }
    }
  }

  for (const playerId of playerIds) {
    const sessionPrice = await getMorningSquadSessionPrice(
      supabase, auth.familyId, programId, program?.type, playerId,
    )
    // Check not already attending
    const { data: existingAttendance } = await supabase
      .from('attendances')
      .select('id')
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
      .single()

    if (existingAttendance) continue // skip if already booked

    // Create attendance record
    const { error: attError } = await supabase
      .from('attendances')
      .insert({
        session_id: sessionId,
        player_id: playerId,
        status: 'present',
      })

    if (attError) {
      console.error('Failed to create attendance:', attError.message)
      return { error: 'Failed to book session. Please try again.' }
    }

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
        description: formatChargeDescription({
          playerName: playerNameById.get(playerId),
          label: program?.name ?? 'Session',
          term: getTermLabel(session.date),
          date: session.date,
        }),
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
  const { error: attError } = await supabase
    .from('attendances')
    .upsert(
      { session_id: sessionId, player_id: playerId, status: 'absent' },
      { onConflict: 'session_id,player_id' }
    )

  if (attError) {
    console.error('Failed to mark away:', attError.message)
    return { error: 'Failed to mark away. Please try again.' }
  }

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
  const { error: attError } = await supabase
    .from('attendances')
    .delete()
    .eq('session_id', sessionId)
    .eq('player_id', playerId)

  if (attError) {
    console.error('Failed to cancel attendance:', attError.message)
    return { error: 'Failed to cancel booking. Please try again.' }
  }

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

// ── Unenrol a player from a term program ────────────────────────────────

export async function unenrolFromProgram(
  programId: string,
  playerId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth) return { error: 'Not authenticated' }

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`unenrol:${auth.userId}`, 5, 60_000)) {
    return { error: 'Too many requests. Please wait a moment.' }
  }

  // Verify player belongs to this family
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name')
    .eq('id', playerId)
    .eq('family_id', auth.familyId)
    .single()

  if (!player) return { error: 'Player not found' }

  // Verify the player is enrolled in this program
  const { data: rosterEntry } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', programId)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .single()

  if (!rosterEntry) return { error: 'Player is not enrolled in this program' }

  // Withdraw from roster (soft delete)
  const { error: rosterError } = await supabase
    .from('program_roster')
    .update({ status: 'withdrawn' })
    .eq('id', rosterEntry.id)

  if (rosterError) {
    console.error('Failed to withdraw from roster:', rosterError.message)
    return { error: 'Failed to unenrol. Please try again.' }
  }

  // Void all future pending charges for this player+program
  const today = new Date().toISOString().split('T')[0]
  const { data: futureSessionCharges } = await supabase
    .from('charges')
    .select('id, session_id, sessions:session_id(date)')
    .eq('family_id', auth.familyId)
    .eq('player_id', playerId)
    .eq('program_id', programId)
    .eq('status', 'pending')

  for (const c of futureSessionCharges ?? []) {
    const session = c.sessions as unknown as { date: string } | null
    if (session && session.date > today) {
      await voidCharge(supabase, c.id, auth.familyId)
    }
  }

  // Notify admin
  const { sendPushToAdmins } = await import('@/lib/push/send')
  const { data: program } = await supabase.from('programs').select('name').eq('id', programId).single()
  await sendPushToAdmins({
    title: 'Player Unenrolled',
    body: `${player.first_name} was unenrolled from ${program?.name ?? 'a program'} by their parent.`,
    url: `/admin/programs/${programId}`,
  }).catch(() => {})

  revalidatePath(`/parent/programs/${programId}`)
  revalidatePath('/parent/programs')
  revalidatePath('/parent')
  revalidatePath('/parent/payments')
  return {}
}
