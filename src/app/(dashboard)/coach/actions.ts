'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import {
  validateFormData,
  lessonNoteFormSchema,
  attendanceStatusSchema,
  coachAvailabilityFormSchema,
  coachExceptionFormSchema,
  payPeriodSchema,
} from '@/lib/utils/validation'
import {
  createCharge,
  formatChargeDescription,
  voidCharge,
  getExistingSessionCharge,
  recalcFamiliesForSession,
} from '@/lib/utils/billing'
import {
  getPlayerSessionPriceBreakdown,
  getPlayerEffectiveSessionPriceBreakdown,
  formatDiscountSuffix,
  buildPricingBreakdown,
} from '@/lib/utils/player-pricing'
import { getTermLabel } from '@/lib/utils/school-terms'

// ── Lesson Notes ────────────────────────────────────────────────────────

export async function createLessonNote(sessionId: string, formData: FormData) {
  const { user, coachId } = await requireCoach()
  const supabase = await createClient()

  // Rate limit: 20 lesson notes per minute per user
  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`note:${user.id}`, 20, 60_000)) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent('Too many requests. Please wait a moment.')}`)
  }

  const parsed = validateFormData(formData, lessonNoteFormSchema)
  if (!parsed.success) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { player_id: playerId, focus, progress, drills_used: drillsUsed, video_url: videoUrl, next_plan: nextPlan, notes } = parsed.data

  const { error } = await supabase
    .from('lesson_notes')
    .insert({
      session_id: sessionId,
      player_id: playerId,
      coach_id: coachId,
      focus: focus || null,
      progress: progress || null,
      drills_used: drillsUsed ? drillsUsed.split(',').map(s => s.trim()) : null,
      video_url: videoUrl || null,
      next_plan: nextPlan || null,
      notes: notes || null,
    })

  if (error) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent('Failed to save lesson note')}`)
  }

  revalidatePath(`/coach/schedule/${sessionId}`)
  redirect(`/coach/schedule/${sessionId}`)
}

// ── Mark Attendance (coach) ────────────────────────────────────────────

export async function coachUpdateAttendance(sessionId: string, formData: FormData) {
  const { user } = await requireCoach()
  const supabase = await createClient()

  // Rate limit: 30 attendance updates per minute per user
  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`attendance:${user.id}`, 30, 60_000)) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent('Too many requests. Please wait a moment.')}`)
  }

  const entries: { playerId: string; status: string }[] = []
  formData.forEach((value, key) => {
    if (key.startsWith('attendance_')) {
      const playerId = key.replace('attendance_', '')
      const status = value as string
      const statusResult = attendanceStatusSchema.safeParse(status)
      if (statusResult.success) {
        entries.push({ playerId, status: statusResult.data })
      }
    }
  })

  for (const entry of entries) {
    await supabase
      .from('attendances')
      .upsert(
        { session_id: sessionId, player_id: entry.playerId, status: entry.status },
        { onConflict: 'session_id,player_id' }
      )
  }

  // ── Billing side effects (06-May-2026) ────────────────────────────────
  // Mirrors admin `updateAttendance`: marking a player present/absent/noshow
  // can produce / void a charge depending on whether the player is on the
  // program roster and the booking's payment_option. Without this block,
  // coach-marked attendance was a no-op for billing — fine for term-pre-paid
  // sessions (charges already exist + dedup catches them), but a real bug
  // for non-rostered walk-ins where no charge ever materialised.
  // Coach RLS gives them read access to bookings/charges/players for their
  // own sessions; the same JWT-scoped client handles inserts and updates.
  const { data: session } = await supabase
    .from('sessions')
    .select('id, program_id, session_type, date, start_time, coach_id, coaches:coach_id(name)')
    .eq('id', sessionId)
    .single()

  const playerNames = new Map<string, string>()
  if (entries.length > 0) {
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, first_name')
      .in('id', entries.map(e => e.playerId))
    for (const p of playerRows ?? []) playerNames.set(p.id, p.first_name)
  }
  const sessionDate = session?.date ?? null
  const termLabel = sessionDate ? getTermLabel(sessionDate) : null
  const privateCoachName = (session?.coaches as unknown as { name?: string } | null)?.name ?? null

  if (session?.program_id) {
    const programId = session.program_id
    const isPrivate = session.session_type === 'private'

    const { data: program } = await supabase
      .from('programs')
      .select('type, name, per_session_cents')
      .eq('id', programId)
      .single()

    for (const entry of entries) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, family_id, payment_option, sessions_charged')
        .eq('player_id', entry.playerId)
        .eq('program_id', programId)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: false })
        .limit(1)
        .single()

      // Walk-in fallback: no booking → mark-present creates a single-session
      // charge. Absorbed cleanly later when the family enrols for the term.
      // Mark-absent / mark-noshow voids the existing walk-in charge — the
      // walk-in is being cancelled, the family never contracted to attend
      // via a booking, and there's no forfeit policy for a non-rostered
      // no-show. Mirrors the same shape in admin `updateAttendance`.
      if (!booking) {
        const { data: walkInPlayer } = await supabase
          .from('players')
          .select('family_id')
          .eq('id', entry.playerId)
          .single()
        if (!walkInPlayer?.family_id) continue
        const walkInExisting = await getExistingSessionCharge(supabase, sessionId, entry.playerId)

        if (entry.status === 'present') {
          if (walkInExisting) continue
          const walkInBreakdown = await getPlayerEffectiveSessionPriceBreakdown(
            supabase, walkInPlayer.family_id, programId, program?.type, entry.playerId,
          )
          if (walkInBreakdown.priceCents <= 0) continue
          await createCharge(supabase, {
            familyId: walkInPlayer.family_id,
            playerId: entry.playerId,
            type: 'session',
            sourceType: 'attendance',
            sourceId: sessionId,
            sessionId,
            programId,
            description: formatChargeDescription({
              playerName: playerNames.get(entry.playerId),
              label: `${program?.name ?? 'Session'} (walk-in)`,
              suffix: formatDiscountSuffix({ multiGroupApplied: walkInBreakdown.multiGroupApplied, earlyPayPct: walkInBreakdown.earlyBirdPct }),
              term: termLabel,
              date: sessionDate,
            }),
            amountCents: walkInBreakdown.priceCents,
            status: 'confirmed',
            createdBy: user.id,
            pricingBreakdown: buildPricingBreakdown({
              basePriceCents: walkInBreakdown.basePriceCents,
              perSessionPriceCents: walkInBreakdown.priceCents,
              morningSquadPartnerApplied: walkInBreakdown.morningSquadPartnerApplied,
              multiGroupApplied: walkInBreakdown.multiGroupApplied,
              sessions: 1,
              earlyBirdPct: walkInBreakdown.earlyBirdPct,
            }) as never,
          })
        } else if (walkInExisting) {
          await voidCharge(supabase, walkInExisting.id, walkInPlayer.family_id)
        }
        continue
      }

      const familyId = booking.family_id
      const paymentOption = booking.payment_option
      const existingCharge = await getExistingSessionCharge(supabase, sessionId, entry.playerId)
      const priceBreakdown = await getPlayerSessionPriceBreakdown(
        supabase, familyId, programId, program?.type, entry.playerId,
      )
      const sessionPrice = priceBreakdown.priceCents

      if (paymentOption === 'pay_later') {
        // Pay-later: term enrol already wrote N pending per-session charges
        // at enrol time. Dedup via existingCharge means present/absent are
        // no-ops here for billing; absent voids any pre-existing pending.
        if (entry.status === 'present') {
          if (!existingCharge) {
            // Term enrolment somehow missed this session (e.g. enrolled
            // after the session date passed without a backfill). Create a
            // walk-in-shaped charge so the family pays for delivered service.
            await createCharge(supabase, {
              familyId,
              playerId: entry.playerId,
              type: 'session',
              sourceType: 'attendance',
              sourceId: sessionId,
              sessionId,
              programId,
              bookingId: booking.id,
              description: formatChargeDescription({
                playerName: playerNames.get(entry.playerId),
                label: program?.name ?? 'Session',
                suffix: formatDiscountSuffix({ multiGroupApplied: priceBreakdown.multiGroupApplied, earlyPayPct: 0 }),
                term: termLabel,
                date: sessionDate,
              }),
              amountCents: sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
              pricingBreakdown: buildPricingBreakdown({
                basePriceCents: priceBreakdown.basePriceCents,
                perSessionPriceCents: priceBreakdown.priceCents,
                morningSquadPartnerApplied: priceBreakdown.morningSquadPartnerApplied,
                multiGroupApplied: priceBreakdown.multiGroupApplied,
                sessions: 1,
              }) as never,
            })
          }
        } else if (entry.status === 'absent') {
          if (existingCharge) {
            await voidCharge(supabase, existingCharge.id, familyId)
          }
        }
        // 'noshow' policy lives in admin/actions.ts; coach attendance lets
        // admin recompute on review (matches existing posture — coach was a
        // no-op for billing prior to this change).
      } else if (isPrivate) {
        // Private lessons (coach marking attendance for their own session)
        if (entry.status === 'present') {
          if (!existingCharge) {
            await createCharge(supabase, {
              familyId,
              playerId: entry.playerId,
              type: 'private',
              sourceType: 'attendance',
              sourceId: sessionId,
              sessionId,
              programId,
              bookingId: booking.id,
              description: formatChargeDescription({
                playerName: playerNames.get(entry.playerId),
                label: privateCoachName ? `Private w/ ${privateCoachName}` : 'Private lesson',
                date: sessionDate,
              }),
              amountCents: sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
            })
          }
        } else if (entry.status === 'absent') {
          if (existingCharge) {
            await voidCharge(supabase, existingCharge.id, familyId)
          }
        }
      }
      // pay_now path: charges already exist and are paid. No-op for coach.
    }
  }

  // Mark session as completed if not already
  await supabase
    .from('sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId)
    .eq('status', 'scheduled')

  // Charges for this session now move into the confirmed_balance set — refresh
  // every family with a charge here so their cached balance matches reality.
  await recalcFamiliesForSession(supabase, sessionId)

  revalidatePath(`/coach/schedule/${sessionId}`)
  redirect(`/coach/schedule/${sessionId}`)
}

// ── Coach Availability ─────────────────────────────────────────────────

export async function setAvailability(formData: FormData) {
  const { user, coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`availability:${user.id}`, 20, 60_000)) {
    redirect('/coach/availability?error=Too+many+requests')
  }

  const parsed = validateFormData(formData, coachAvailabilityFormSchema)
  if (!parsed.success) {
    redirect(`/coach/availability?error=${encodeURIComponent(parsed.error)}`)
  }

  // Coach can only set their own availability
  const { error } = await supabase
    .from('coach_availability')
    .insert({
      coach_id: coachId,
      day_of_week: parsed.data.day_of_week,
      start_time: parsed.data.start_time,
      end_time: parsed.data.end_time,
    })

  if (error) {
    const msg = error.code === '23505' ? 'This time slot already exists' : 'Failed to add availability'
    redirect(`/coach/availability?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/coach/availability')
  redirect('/coach/availability')
}

export async function removeAvailability(availabilityId: string) {
  await requireCoach()
  const supabase = await createClient()

  // RLS ensures coach can only delete their own
  const { error } = await supabase
    .from('coach_availability')
    .delete()
    .eq('id', availabilityId)

  if (error) {
    redirect(`/coach/availability?error=${encodeURIComponent('Failed to remove availability')}`)
  }

  revalidatePath('/coach/availability')
  redirect('/coach/availability')
}

export async function addException(formData: FormData) {
  const { user, coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`exception:${user.id}`, 20, 60_000)) {
    redirect('/coach/availability?error=Too+many+requests')
  }

  const parsed = validateFormData(formData, coachExceptionFormSchema)
  if (!parsed.success) {
    redirect(`/coach/availability?error=${encodeURIComponent(parsed.error)}`)
  }

  const { error } = await supabase
    .from('coach_availability_exceptions')
    .insert({
      coach_id: coachId,
      exception_date: parsed.data.exception_date,
      start_time: parsed.data.start_time || null,
      end_time: parsed.data.end_time || null,
      reason: parsed.data.reason || null,
    })

  if (error) {
    const msg = error.code === '23505' ? 'This exception already exists' : 'Failed to add exception'
    redirect(`/coach/availability?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/coach/availability')
  redirect('/coach/availability')
}

export async function removeException(exceptionId: string) {
  await requireCoach()
  const supabase = await createClient()

  // RLS ensures coach can only delete their own
  const { error } = await supabase
    .from('coach_availability_exceptions')
    .delete()
    .eq('id', exceptionId)

  if (error) {
    redirect(`/coach/availability?error=${encodeURIComponent('Failed to remove exception')}`)
  }

  revalidatePath('/coach/availability')
  redirect('/coach/availability')
}

// Form-data wrapper that accepts a comma-separated list of ids — used by the
// grouped exception list to remove an entire date-range group in one click.
export async function removeExceptionGroup(formData: FormData) {
  await requireCoach()
  const supabase = await createClient()

  const idsRaw = (formData.get('ids') as string) ?? ''
  const ids = idsRaw.split(',').filter(Boolean)
  if (ids.length === 0) redirect('/coach/availability?error=Missing+ids')

  const { error } = await supabase
    .from('coach_availability_exceptions')
    .delete()
    .in('id', ids)

  if (error) {
    redirect(`/coach/availability?error=${encodeURIComponent('Failed to remove exceptions')}`)
  }

  revalidatePath('/coach/availability')
  redirect('/coach/availability')
}

export async function updatePayPeriod(formData: FormData) {
  const { coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const payPeriod = formData.get('pay_period') as string
  const result = payPeriodSchema.safeParse(payPeriod)
  if (!result.success) {
    redirect('/coach/earnings?error=Invalid+pay+period')
  }

  const { error } = await supabase
    .from('coaches')
    .update({ pay_period: result.data })
    .eq('id', coachId)

  if (error) {
    redirect(`/coach/earnings?error=${encodeURIComponent('Failed to update pay period')}`)
  }

  revalidatePath('/coach/earnings')
  redirect('/coach/earnings')
}

// ── Private Booking Confirmation ───────────────────────────────────────

export async function confirmPrivateBooking(bookingId: string) {
  const { user, coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, session_id, family_id, approval_status')
    .eq('id', bookingId)
    .single()

  if (!booking || booking.approval_status !== 'pending') {
    redirect('/coach/privates?error=Booking+not+found+or+already+processed')
  }

  // Verify session belongs to this coach
  const { data: session } = await supabase
    .from('sessions')
    .select('id, coach_id')
    .eq('id', booking.session_id!)
    .eq('coach_id', coachId)
    .single()

  if (!session) {
    redirect('/coach/privates?error=Not+authorized+to+confirm+this+booking')
  }

  await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      approval_status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', bookingId)

  await supabase
    .from('charges')
    .update({ status: 'confirmed' })
    .eq('booking_id', bookingId)
    .eq('status', 'pending')

  // Notify parent + admins (cross-notification)
  const { data: parentRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('family_id', booking.family_id)
    .eq('role', 'parent')
    .limit(1)
    .single()

  const { sendPushToUser, sendPushToAdmins } = await import('@/lib/push/send')
  try {
    // Notify parent
    if (parentRole) {
      await sendPushToUser(parentRole.user_id, {
        title: 'Private Lesson Confirmed',
        body: 'Your booking has been confirmed by the coach',
        url: '/parent/bookings',
      })
    }
    // Notify admins that coach confirmed
    await sendPushToAdmins({
      title: 'Booking Confirmed by Coach',
      body: 'A private lesson booking has been confirmed',
      url: '/admin/bookings',
    })
  } catch { /* non-blocking */ }

  revalidatePath('/coach/privates')
  redirect('/coach/privates')
}

export async function declinePrivateBooking(bookingId: string) {
  const { user, coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, session_id, family_id, approval_status')
    .eq('id', bookingId)
    .single()

  if (!booking || booking.approval_status !== 'pending') {
    redirect('/coach/privates?error=Booking+not+found+or+already+processed')
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, coach_id')
    .eq('id', booking.session_id!)
    .eq('coach_id', coachId)
    .single()

  if (!session) {
    redirect('/coach/privates?error=Not+authorized')
  }

  await supabase
    .from('bookings')
    .update({ status: 'cancelled', approval_status: 'declined' })
    .eq('id', bookingId)

  await supabase
    .from('sessions')
    .update({ status: 'cancelled', cancellation_reason: 'Declined by coach' })
    .eq('id', booking.session_id!)

  // Mask the coach slot so it doesn't auto-reappear as available.
  {
    const { maskCoachSlotOnAdminOrCoachCancel } = await import('@/lib/private-cancel')
    await maskCoachSlotOnAdminOrCoachCancel(supabase, booking.session_id!, 'Coach declined booking')
  }

  // Void charge
  const { voidCharge } = await import('@/lib/utils/billing')
  const { data: charge } = await supabase
    .from('charges')
    .select('id')
    .eq('booking_id', bookingId)
    .in('status', ['pending', 'confirmed'])
    .single()

  if (charge) {
    await voidCharge(supabase, charge.id, booking.family_id)
  }

  // Notify parent + admins
  const { data: parentRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('family_id', booking.family_id)
    .eq('role', 'parent')
    .limit(1)
    .single()

  const { sendPushToUser, sendPushToAdmins } = await import('@/lib/push/send')
  try {
    if (parentRole) {
      await sendPushToUser(parentRole.user_id, {
        title: 'Booking Declined',
        body: 'Your private lesson request was not accepted',
        url: '/parent/bookings',
      })
    }
    await sendPushToAdmins({
      title: 'Booking Declined by Coach',
      body: 'A private lesson request was declined',
      url: '/admin/bookings',
    })
  } catch { /* non-blocking */ }

  revalidatePath('/coach/privates')
  redirect('/coach/privates')
}

export async function completePrivateSession(sessionId: string) {
  const { user, coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, coach_id, date, duration_minutes, status')
    .eq('id', sessionId)
    .eq('coach_id', coachId)
    .eq('session_type', 'private')
    .single()

  if (!session) {
    redirect('/coach/privates?error=Session+not+found')
  }

  if (session.status === 'completed') {
    redirect(`/coach/privates/${sessionId}?error=Already+completed`)
  }

  await supabase
    .from('sessions')
    .update({ status: 'completed', completed_by: user.id })
    .eq('id', sessionId)

  // Charges for this session now move into the confirmed_balance set — refresh
  // every family with a charge here so their cached balance matches reality.
  await recalcFamiliesForSession(supabase, sessionId)

  // Get booking to find price
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, price_cents')
    .eq('session_id', sessionId)
    .eq('booking_type', 'private')
    .single()

  // Confirm charge if still pending
  if (booking) {
    await supabase
      .from('charges')
      .update({ status: 'confirmed' })
      .eq('booking_id', booking.id)
      .eq('status', 'pending')
  }

  // Create coach earnings (skip for owner)
  const { data: coach } = await supabase
    .from('coaches')
    .select('is_owner, pay_period')
    .eq('id', coachId)
    .single()

  if (coach && !coach.is_owner && booking?.price_cents) {
    const { calculateCoachPay, getPayPeriodKey } = await import('@/lib/utils/private-booking')
    const payCents = calculateCoachPay(booking.price_cents)
    const payPeriodKey = getPayPeriodKey(new Date(session.date), coach.pay_period ?? 'weekly')

    const { data: termData } = await supabase.rpc('get_current_term')
    const term = termData?.[0]

    await supabase
      .from('coach_earnings')
      .insert({
        coach_id: coachId,
        session_id: sessionId,
        session_type: 'private',
        amount_cents: payCents,
        duration_minutes: session.duration_minutes ?? 30,
        term: term?.term ?? null,
        year: term?.year ?? null,
        pay_period_key: payPeriodKey,
        status: 'owed',
      })
  }

  revalidatePath('/coach/privates')
  redirect(`/coach/privates/${sessionId}?success=Session+completed`)
}

// ── Coach Attendance (assistant coaches) ──────────────────────────────

export async function markCoachAttendance(sessionId: string, formData: FormData) {
  const { user } = await requireCoach()
  const supabase = await createClient()

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`coach-att:${user.id}`, 20, 60_000)) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent('Too many requests.')}`)
  }

  const entries: { coachId: string; status: string }[] = []
  formData.forEach((value, key) => {
    if (key.startsWith('coach_attendance_')) {
      const coachId = key.replace('coach_attendance_', '')
      const status = value as string
      if (status === 'present' || status === 'absent') {
        entries.push({ coachId, status })
      }
    }
  })

  for (const entry of entries) {
    await supabase
      .from('session_coach_attendances')
      .upsert(
        { session_id: sessionId, coach_id: entry.coachId, status: entry.status, marked_by: user.id },
        { onConflict: 'session_id,coach_id' }
      )
  }

  revalidatePath(`/coach/schedule/${sessionId}`)
  redirect(`/coach/schedule/${sessionId}`)
}

// ── Session Notes (lead coach + admin visible) ────────────────────────

export async function createSessionNote(sessionId: string, formData: FormData) {
  const { user, coachId } = await requireCoach()
  const supabase = await createClient()

  if (!coachId) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent('Coach profile not linked.')}`)
  }

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`session-note:${user.id}`, 10, 60_000)) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent('Too many requests.')}`)
  }

  const notes = (formData.get('session_notes') as string)?.trim()
  if (!notes) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent('Notes cannot be empty.')}`)
  }

  // Upsert: session-level note has player_id = null
  const { data: existing } = await supabase
    .from('lesson_notes')
    .select('id')
    .eq('session_id', sessionId)
    .is('player_id', null)
    .eq('coach_id', coachId!)
    .single()

  if (existing) {
    await supabase
      .from('lesson_notes')
      .update({ notes })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('lesson_notes')
      .insert({
        session_id: sessionId,
        player_id: null,
        coach_id: coachId,
        notes,
      })
  }

  revalidatePath(`/coach/schedule/${sessionId}`)
  redirect(`/coach/schedule/${sessionId}`)
}

// ── Walk-in Player Search ─────────────────────────────────────────────

export async function searchPlayersForCoach(query: string) {
  'use server'
  const { user: _user } = await requireCoach()
  const supabase = await createClient()

  if (!query || query.length < 2) return []

  const { data } = await supabase.rpc('search_players_for_coach', { query })
  return data ?? []
}

// ── Walk-in Player Add ────────────────────────────────────────────────

export async function addWalkInPlayer(sessionId: string, playerId: string, charge: boolean) {
  const { user } = await requireCoach()
  const supabase = await createClient()

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`walkin:${user.id}`, 20, 60_000)) {
    redirect(`/coach/schedule/${sessionId}?error=${encodeURIComponent('Too many requests.')}`)
  }

  // Create attendance record
  await supabase
    .from('attendances')
    .upsert(
      { session_id: sessionId, player_id: playerId, status: 'present' },
      { onConflict: 'session_id,player_id' }
    )

  // Optionally create a charge at casual session rate
  if (charge) {
    // Get session's program for pricing
    const { data: session } = await supabase
      .from('sessions')
      .select('program_id')
      .eq('id', sessionId)
      .single()

    if (session?.program_id) {
      // Get player's family
      const { data: player } = await supabase
        .from('players')
        .select('family_id')
        .eq('id', playerId)
        .single()

      if (player?.family_id) {
        // Effective price: inherits the term per-session rate (incl. early-bird)
        // when the player is on the program roster; otherwise standard walk-in
        // pricing (morning-squad partner + family override + 25% multi-group).
        const { getPlayerEffectiveSessionPriceBreakdown, formatDiscountSuffix, buildPricingBreakdown } = await import('@/lib/utils/player-pricing')
        const { data: programRow } = await supabase
          .from('programs')
          .select('type')
          .eq('id', session.program_id)
          .single()
        const breakdown = await getPlayerEffectiveSessionPriceBreakdown(
          supabase, player.family_id, session.program_id, programRow?.type ?? null, playerId,
        )
        const priceCents = breakdown.priceCents

        if (priceCents > 0) {
          const { createCharge } = await import('@/lib/utils/billing')
          const suffix = formatDiscountSuffix({ multiGroupApplied: breakdown.multiGroupApplied, earlyPayPct: breakdown.earlyBirdPct })
          await createCharge(supabase, {
            familyId: player.family_id,
            playerId,
            type: 'casual',
            sourceType: 'attendance',
            sourceId: sessionId,
            sessionId,
            programId: session.program_id,
            description: suffix ? `Walk-in session (${suffix})` : 'Walk-in session',
            amountCents: priceCents,
            status: 'confirmed',
            createdBy: user.id,
            pricingBreakdown: buildPricingBreakdown({
              basePriceCents: breakdown.basePriceCents,
              perSessionPriceCents: breakdown.priceCents,
              morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
              multiGroupApplied: breakdown.multiGroupApplied,
              sessions: 1,
              earlyBirdPct: breakdown.earlyBirdPct,
            }) as never,
          })
        }
      }
    }
  }

  revalidatePath(`/coach/schedule/${sessionId}`)
  redirect(`/coach/schedule/${sessionId}`)
}

// ── Stage-and-Save Availability ────────────────────────────────────────

export async function applyAvailabilityChanges(formData: FormData) {
  const { user, coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`avail-apply:${user.id}`, 10, 60_000)) {
    redirect('/coach/availability?error=Too+many+requests')
  }

  const deletesRaw = (formData.get('deletes') as string) ?? ''
  const insertsRaw = (formData.get('inserts') as string) ?? '[]'
  const deleteIds = deletesRaw.split(',').filter(Boolean)
  let inserts: { day: number; start: string; end: string }[] = []
  try {
    inserts = JSON.parse(insertsRaw)
    if (!Array.isArray(inserts)) inserts = []
  } catch {
    inserts = []
  }

  if (deleteIds.length === 0 && inserts.length === 0) {
    redirect('/coach/availability')
  }

  const { error } = await supabase.rpc('apply_coach_availability_changes', {
    p_coach_id: coachId,
    p_delete_ids: deleteIds,
    p_inserts: inserts,
  })

  if (error) {
    redirect(`/coach/availability?error=${encodeURIComponent(error.message ?? 'Failed to save changes')}`)
  }

  revalidatePath('/coach/availability')
  redirect('/coach/availability?success=Availability+saved')
}

export async function addExceptionRange(formData: FormData) {
  const { user, coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`exc-range:${user.id}`, 10, 60_000)) {
    redirect('/coach/availability?error=Too+many+requests')
  }

  const startDate = formData.get('start_date') as string
  const endDate = (formData.get('end_date') as string) || startDate
  const allDay = formData.get('all_day') === 'on'
  const startTime = allDay ? null : (formData.get('start_time') as string) || null
  const endTime = allDay ? null : (formData.get('end_time') as string) || null
  const reason = (formData.get('reason') as string) || null

  if (!startDate) {
    redirect('/coach/availability?error=Start+date+is+required')
  }

  const { error } = await supabase.rpc('add_coach_exception_range', {
    p_coach_id: coachId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_start_time: startTime ?? undefined,
    p_end_time: endTime ?? undefined,
    p_reason: reason ?? undefined,
  })

  if (error) {
    redirect(`/coach/availability?error=${encodeURIComponent(error.message ?? 'Failed to add exception')}`)
  }

  revalidatePath('/coach/availability')
  redirect('/coach/availability?success=Exception+added')
}

// ── Coach Notification Preferences ─────────────────────────────────────

export async function updateCoachNotificationPreferences(formData: FormData) {
  const { coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const next = {
    booking_requests: formData.get('booking_requests') === 'on',
    daily_session_digest: formData.get('daily_session_digest') === 'on',
    late_cancellations: formData.get('late_cancellations') === 'on',
  }

  // Preserve any other keys that might exist
  const { data: existing } = await supabase
    .from('coaches')
    .select('notification_preferences')
    .eq('id', coachId)
    .single()
  const current = (existing?.notification_preferences as Record<string, unknown> | null) ?? {}

  const { error } = await supabase
    .from('coaches')
    .update({ notification_preferences: { ...current, ...next } })
    .eq('id', coachId)

  if (error) {
    redirect(`/coach/settings?error=${encodeURIComponent('Failed to update preferences')}`)
  }

  revalidatePath('/coach/settings')
  redirect('/coach/settings?success=Notification+preferences+updated')
}
