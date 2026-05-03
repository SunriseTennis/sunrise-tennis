'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push/send'
import { validateFormData, enrolFormSchema } from '@/lib/utils/validation'
import { createCharge, getTermPrice, voidCharge, getExistingSessionCharge, formatChargeDescription } from '@/lib/utils/billing'
import { getTermLabel } from '@/lib/utils/school-terms'
import { isEligible, getActiveEarlyBird } from '@/lib/utils/eligibility'
import { getPlayerSessionPrice, getPlayerSessionPriceBreakdown, formatDiscountSuffix, buildPricingBreakdown } from '@/lib/utils/player-pricing'
import { dispatchNotification } from '@/lib/notifications/dispatch'

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

  // Resolve pricing (family override > program default), apply morning-squad
  // partner rule + 25% multi-group recalc per player. Term-fee path stays
  // term-fee (locked at booking); per-session paths recalc on each event.
  let priceCents = 0
  let discountCents = 0
  let activeDiscountPct = 0
  let multiGroupApplied = false
  let termPriceBreakdown: ReturnType<typeof buildPricingBreakdown> | null = null
  let casualBreakdown: ReturnType<typeof buildPricingBreakdown> | null = null

  if (isTermEnrollment && effectivePaymentOption === 'pay_now') {
    // Term fee (may be overridden per family)
    const termPrice = await getTermPrice(supabase, familyId, programId, program?.type)
    const breakdown = await getPlayerSessionPriceBreakdown(
      supabase, familyId, programId, program?.type, playerId,
    )

    // Term-fee override is the locked-in deal; per-session × sessions otherwise
    // (and per-session already has multi-group baked in).
    priceCents = termPrice > 0 ? termPrice : breakdown.priceCents * sessionsTotal
    multiGroupApplied = termPrice > 0 ? false : breakdown.multiGroupApplied

    // Apply tiered early-pay discount (15% tier 1, 10% tier 2, 0% expired) on top
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

    // Only build a breakdown for the per-session × sessions case; term-fee
    // overrides are opaque (a flat number set per family), so the
    // sessions-itemised view doesn't apply.
    if (termPrice <= 0 && sessionsTotal > 0) {
      termPriceBreakdown = buildPricingBreakdown({
        basePriceCents: breakdown.basePriceCents,
        perSessionPriceCents: breakdown.priceCents,
        morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
        multiGroupApplied: breakdown.multiGroupApplied,
        sessions: sessionsTotal,
        earlyBirdPct: activeDiscountPct,
      })
    }
  } else if (isTermEnrollment && effectivePaymentOption === 'pay_later') {
    // Projected total only — actual charges created per-session at attendance
    // time and re-priced then via the same helper (recalc).
    const sessionPrice = await getPlayerSessionPrice(
      supabase, familyId, programId, program?.type, playerId,
    )
    priceCents = sessionPrice * sessionsTotal
  } else if (bookingType === 'casual') {
    const breakdown = await getPlayerSessionPriceBreakdown(
      supabase, familyId, programId, program?.type, playerId,
    )
    priceCents = breakdown.priceCents
    multiGroupApplied = breakdown.multiGroupApplied
    casualBreakdown = buildPricingBreakdown({
      basePriceCents: breakdown.basePriceCents,
      perSessionPriceCents: breakdown.priceCents,
      morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
      multiGroupApplied: breakdown.multiGroupApplied,
      sessions: 1,
    })
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
        suffix: formatDiscountSuffix({ multiGroupApplied, earlyPayPct: discountCents > 0 ? activeDiscountPct : 0 }),
        term: getTermLabel(new Date()),
      }),
      amountCents: chargeAmount,
      status: 'confirmed',
      createdBy: auth.userId,
      pricingBreakdown: termPriceBreakdown
        ? { ...termPriceBreakdown, total_cents: chargeAmount } as never
        : null,
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
        suffix: formatDiscountSuffix({ multiGroupApplied, earlyPayPct: 0 }),
        term: getTermLabel(new Date()),
      }),
      amountCents: priceCents,
      status: 'pending',
      createdBy: auth.userId,
      pricingBreakdown: casualBreakdown ? (casualBreakdown as never) : null,
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

    // Also notify admin via the rules-driven dispatcher.
    await dispatchNotification(isTermEnrollment ? 'parent.program.enrolled' : 'parent.session.booked', {
      playerName: player.first_name,
      programName: program?.name ?? 'program',
      excludeUserId: auth.userId,
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
    const breakdown = await getPlayerSessionPriceBreakdown(
      supabase, auth.familyId, programId, program?.type, playerId,
    )
    const sessionPrice = breakdown.priceCents
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
      const sessionBreakdown = buildPricingBreakdown({
        basePriceCents: breakdown.basePriceCents,
        perSessionPriceCents: breakdown.priceCents,
        morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
        multiGroupApplied: breakdown.multiGroupApplied,
        sessions: 1,
      })
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
          suffix: formatDiscountSuffix({ multiGroupApplied: breakdown.multiGroupApplied, earlyPayPct: 0 }),
          term: getTermLabel(session.date),
          date: session.date,
        }),
        amountCents: sessionPrice,
        status: 'confirmed',
        createdBy: auth.userId,
        pricingBreakdown: sessionBreakdown as never,
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

  // Dispatcher notify (parent.session.away → assigned coach).
  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('coach_id, date, programs:program_id(name)')
      .eq('id', sessionId)
      .single()
    const { data: playerInfo } = await supabase
      .from('players')
      .select('first_name')
      .eq('id', playerId)
      .single()
    const program = session?.programs as unknown as { name: string } | null
    if (session?.coach_id) {
      await dispatchNotification('parent.session.away', {
        coachId: session.coach_id,
        playerName: playerInfo?.first_name ?? 'A player',
        programName: program?.name ?? 'session',
        date: session.date ?? '',
        excludeUserId: auth.userId,
      })
    }
  } catch { /* non-blocking */ }

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

  // Notify admin via the rules-driven dispatcher.
  try {
    const { data: program } = await supabase.from('programs').select('name').eq('id', programId).single()
    await dispatchNotification('parent.program.unenrolled', {
      playerName: player.first_name,
      programName: program?.name ?? 'a program',
      excludeUserId: auth.userId,
    })
  } catch { /* non-blocking */ }

  revalidatePath(`/parent/programs/${programId}`)
  revalidatePath('/parent/programs')
  revalidatePath('/parent')
  revalidatePath('/parent/payments')
  return {}
}

// ── Pay-Now Stripe Inline Flow ─────────────────────────────────────────
//
// Two-step flow for term-enrolment pay-now:
//
//   1. prepareEnrolPayment: validates + creates Stripe PaymentIntent + inserts
//      a `pending` payment row keyed on the intent id. NO booking/charge yet.
//   2. (client confirms via Stripe Elements)
//   3. finalizeEnrolPayment: re-validates capacity, creates booking + roster +
//      charge, marks payment 'received', allocates payment to the new charge.
//
// If the parent abandons the modal: the PaymentIntent expires on Stripe's side,
// no booking ever lands. The pending payment row stays as an audit hint that
// someone tried — it's filtered out of the "Recent" admin list by the existing
// `.neq('status', 'pending')` predicate.

type PreparedPayment =
  | {
      ok: true
      clientSecret: string
      intentId: string
      amountCents: number
      breakdown: ReturnType<typeof buildPricingBreakdown> | null
    }
  | { ok: false; error: string }

export async function prepareEnrolPayment(
  programId: string,
  formData: FormData,
): Promise<PreparedPayment> {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth) return { ok: false, error: 'Not signed in' }

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`prepare-enrol:${auth.userId}`, 5, 60_000)) {
    return { ok: false, error: 'Too many requests. Please wait a moment.' }
  }

  const parsed = validateFormData(formData, enrolFormSchema)
  if (!parsed.success) return { ok: false, error: parsed.error }

  const { player_id: playerId, booking_type: bookingType } = parsed.data

  // This action is only for term enrolment pay-now. Casual / trial / pay-later
  // continue through the existing enrolInProgram path.
  if (bookingType !== 'term' && bookingType !== 'term_enrollment') {
    return { ok: false, error: 'Inline payment is only for term enrolments' }
  }

  // Player ownership + eligibility
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, gender, classifications, track')
    .eq('id', playerId)
    .eq('family_id', auth.familyId)
    .single()
  if (!player) return { ok: false, error: 'Player not found' }

  const { data: program } = await supabase
    .from('programs')
    .select('id, name, type, day_of_week, term_fee_cents, per_session_cents, max_capacity, early_pay_discount_pct, early_bird_deadline, early_pay_discount_pct_tier2, early_bird_deadline_tier2, allowed_classifications, gender_restriction, track_required')
    .eq('id', programId)
    .single()
  if (!program) return { ok: false, error: 'Program not found' }

  const eligibility = isEligible(
    { gender: player.gender as 'male' | 'female' | 'non_binary' | null, classifications: player.classifications, track: player.track },
    { day_of_week: program.day_of_week, allowed_classifications: program.allowed_classifications, gender_restriction: program.gender_restriction, track_required: program.track_required },
  )
  if (!eligibility.ok) return { ok: false, error: eligibility.message ?? 'Not eligible' }

  // Capacity check
  const { count: enrolledCount } = await supabase
    .from('program_roster')
    .select('*', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('status', 'enrolled')
  if (program.max_capacity && (enrolledCount ?? 0) >= program.max_capacity) {
    return { ok: false, error: 'This program is full' }
  }

  // Already enrolled?
  const { data: existing } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', programId)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .maybeSingle()
  if (existing) return { ok: false, error: 'Player already enrolled' }

  // Compute price + breakdown
  const { count: sessionsRemaining } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('program_id', programId)
    .gte('date', new Date().toISOString().split('T')[0])
    .eq('status', 'scheduled')

  const sessionsTotal = sessionsRemaining ?? 0
  const termPrice = await getTermPrice(supabase, auth.familyId, programId, program.type)
  const breakdown = await getPlayerSessionPriceBreakdown(
    supabase, auth.familyId, programId, program.type, playerId,
  )

  let priceCents = termPrice > 0 ? termPrice : breakdown.priceCents * sessionsTotal
  let activeDiscountPct = 0
  const eb = getActiveEarlyBird({
    early_pay_discount_pct: program.early_pay_discount_pct ?? null,
    early_bird_deadline: program.early_bird_deadline ?? null,
    early_pay_discount_pct_tier2: program.early_pay_discount_pct_tier2 ?? null,
    early_bird_deadline_tier2: program.early_bird_deadline_tier2 ?? null,
  })
  if (eb.pct > 0 && priceCents > 0) {
    priceCents = priceCents - Math.round(priceCents * (eb.pct / 100))
    activeDiscountPct = eb.pct
  }

  if (priceCents < 100) {
    return { ok: false, error: 'Total is below the minimum payable amount ($1)' }
  }

  const pricingBreakdown = (termPrice <= 0 && sessionsTotal > 0)
    ? buildPricingBreakdown({
        basePriceCents: breakdown.basePriceCents,
        perSessionPriceCents: breakdown.priceCents,
        morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
        multiGroupApplied: breakdown.multiGroupApplied,
        sessions: sessionsTotal,
        earlyBirdPct: activeDiscountPct,
      })
    : null

  // Create Stripe PaymentIntent
  const { getStripe } = await import('@/lib/stripe/client')
  const stripe = getStripe()
  let intent
  try {
    intent = await stripe.paymentIntents.create({
      amount: priceCents,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      description: `${program.name} — Term enrolment for ${player.first_name}`,
      metadata: {
        purpose: 'term_enrolment_pay_now',
        family_id: auth.familyId,
        user_id: auth.userId,
        program_id: programId,
        player_id: playerId,
      },
    })
  } catch (e) {
    console.error('Stripe createPaymentIntent failed (term enrol pay-now):', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Payment could not be initialised. Please try again.' }
  }

  if (!intent.client_secret) return { ok: false, error: 'Payment could not be initialised.' }

  // Insert pending payment row keyed on intent. Webhook will idempotently flip
  // it to 'received' if `finalizeEnrolPayment` doesn't get there first.
  const { error: payErr } = await supabase
    .from('payments')
    .insert({
      family_id: auth.familyId,
      amount_cents: priceCents,
      payment_method: 'stripe',
      status: 'pending',
      stripe_payment_intent_id: intent.id,
      description: `${program.name} — Term enrolment for ${player.first_name}`,
      recorded_by: auth.userId,
    })
  if (payErr) {
    console.error('pending payment insert failed (intent already created):', payErr.message, 'PI:', intent.id)
    return { ok: false, error: 'Payment could not be recorded. Please contact admin.' }
  }

  return {
    ok: true,
    clientSecret: intent.client_secret,
    intentId: intent.id,
    amountCents: priceCents,
    breakdown: pricingBreakdown,
  }
}

type FinalizeResult = { ok: true; programId: string } | { ok: false; error: string }

export async function finalizeEnrolPayment(intentId: string): Promise<FinalizeResult> {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth) return { ok: false, error: 'Not signed in' }

  // Pull intent from Stripe and verify it succeeded
  const { getStripe } = await import('@/lib/stripe/client')
  const stripe = getStripe()
  let intent
  try {
    intent = await stripe.paymentIntents.retrieve(intentId)
  } catch (e) {
    console.error('Stripe paymentIntents.retrieve failed:', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Could not verify payment.' }
  }

  if (intent.status !== 'succeeded') {
    return { ok: false, error: `Payment not complete (status: ${intent.status})` }
  }

  // Metadata sanity — ensure it's our intent and matches the caller
  const md = intent.metadata ?? {}
  if (md.purpose !== 'term_enrolment_pay_now') {
    return { ok: false, error: 'Wrong payment purpose' }
  }
  if (md.family_id !== auth.familyId || md.user_id !== auth.userId) {
    return { ok: false, error: 'Payment metadata does not match caller' }
  }

  const programId = md.program_id as string
  const playerId = md.player_id as string

  // Find the pending payment row for this intent
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('stripe_payment_intent_id', intentId)
    .single()
  if (!payment) {
    return { ok: false, error: 'Payment record not found' }
  }

  // Idempotency: if a booking for this intent already exists, just redirect.
  // We use the booking notes field to stash the intent id so we can detect re-fires.
  const { data: priorBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('family_id', auth.familyId)
    .eq('program_id', programId)
    .eq('player_id', playerId)
    .eq('booking_type', 'term')
    .like('notes', `%[stripe_intent:${intentId}]%`)
    .maybeSingle()
  if (priorBooking) {
    return { ok: true, programId }
  }

  // Re-check eligibility + capacity (race-safe)
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, gender, classifications, track')
    .eq('id', playerId)
    .eq('family_id', auth.familyId)
    .single()
  if (!player) return { ok: false, error: 'Player not found' }

  const { data: program } = await supabase
    .from('programs')
    .select('id, name, type, day_of_week, term_fee_cents, per_session_cents, max_capacity, early_pay_discount_pct, early_bird_deadline, early_pay_discount_pct_tier2, early_bird_deadline_tier2, allowed_classifications, gender_restriction, track_required')
    .eq('id', programId)
    .single()
  if (!program) return { ok: false, error: 'Program not found' }

  const eligibility = isEligible(
    { gender: player.gender as 'male' | 'female' | 'non_binary' | null, classifications: player.classifications, track: player.track },
    { day_of_week: program.day_of_week, allowed_classifications: program.allowed_classifications, gender_restriction: program.gender_restriction, track_required: program.track_required },
  )
  if (!eligibility.ok) return { ok: false, error: 'Eligibility changed since payment — contact admin for refund' }

  const { count: enrolledCount } = await supabase
    .from('program_roster')
    .select('*', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('status', 'enrolled')
  if (program.max_capacity && (enrolledCount ?? 0) >= program.max_capacity) {
    return { ok: false, error: 'Program filled while you were paying — contact admin for refund' }
  }

  // Add to roster
  await supabase.from('program_roster').insert({
    program_id: programId,
    player_id: playerId,
    status: 'enrolled',
  })

  // Recompute pricing breakdown for the charge — trust intent.amount as the locked amount paid
  const { count: sessionsRemaining } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('program_id', programId)
    .gte('date', new Date().toISOString().split('T')[0])
    .eq('status', 'scheduled')

  const sessionsTotal = sessionsRemaining ?? 0
  const breakdown = await getPlayerSessionPriceBreakdown(
    supabase, auth.familyId, programId, program.type, playerId,
  )

  const eb = getActiveEarlyBird({
    early_pay_discount_pct: program.early_pay_discount_pct ?? null,
    early_bird_deadline: program.early_bird_deadline ?? null,
    early_pay_discount_pct_tier2: program.early_pay_discount_pct_tier2 ?? null,
    early_bird_deadline_tier2: program.early_bird_deadline_tier2 ?? null,
  })
  const earlyPct = eb.pct

  const pricingBreakdown = sessionsTotal > 0
    ? buildPricingBreakdown({
        basePriceCents: breakdown.basePriceCents,
        perSessionPriceCents: breakdown.priceCents,
        morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
        multiGroupApplied: breakdown.multiGroupApplied,
        sessions: sessionsTotal,
        earlyBirdPct: earlyPct,
      })
    : null

  // Booking row — embed intent id in notes for idempotency on future calls
  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      family_id: auth.familyId,
      player_id: playerId,
      program_id: programId,
      booking_type: 'term',
      status: 'confirmed',
      booked_by: auth.userId,
      notes: `Pay-now via Stripe [stripe_intent:${intentId}]`,
      payment_option: 'pay_now',
      price_cents: intent.amount,
      discount_cents: 0,
      sessions_total: sessionsTotal,
      sessions_charged: 0,
    })
    .select('id')
    .single()

  // Charge — match the actual paid amount on Stripe
  if (booking) {
    await createCharge(supabase, {
      familyId: auth.familyId,
      playerId,
      type: 'term_enrollment',
      sourceType: 'enrollment',
      sourceId: booking.id,
      programId,
      bookingId: booking.id,
      description: formatChargeDescription({
        playerName: player.first_name,
        label: `${program.name} - Term enrolment`,
        suffix: formatDiscountSuffix({ multiGroupApplied: breakdown.multiGroupApplied, earlyPayPct: earlyPct }),
        term: getTermLabel(new Date()),
      }),
      amountCents: intent.amount,
      status: 'confirmed',
      createdBy: auth.userId,
      pricingBreakdown: pricingBreakdown
        ? ({ ...pricingBreakdown, total_cents: intent.amount } as never)
        : null,
    })
  }

  // Flip payment to received (idempotent — webhook may have done it already)
  if (payment.status === 'pending') {
    await supabase
      .from('payments')
      .update({ status: 'received', received_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('status', 'pending')
  }

  // Allocate payment to the new charge (FIFO will pick it up)
  await supabase.rpc('allocate_payment_to_charges', { target_payment_id: payment.id })
  await supabase.rpc('recalculate_family_balance', { target_family_id: auth.familyId })

  // Notify
  try {
    await sendPushToUser(auth.userId, {
      title: 'Enrolled and Paid',
      body: `Successfully enrolled in ${program.name}. Payment received.`,
      url: `/parent/programs/${programId}`,
    })
  } catch { /* non-fatal */ }

  revalidatePath(`/parent/programs/${programId}`)
  revalidatePath('/parent/programs')
  revalidatePath('/parent')
  revalidatePath('/parent/payments')

  return { ok: true, programId }
}
