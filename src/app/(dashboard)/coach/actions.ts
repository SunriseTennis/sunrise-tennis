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

  // Mark session as completed if not already
  await supabase
    .from('sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId)
    .eq('status', 'scheduled')

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

export async function updatePayPeriod(formData: FormData) {
  const { coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')
  const supabase = await createClient()

  const payPeriod = formData.get('pay_period') as string
  const result = payPeriodSchema.safeParse(payPeriod)
  if (!result.success) {
    redirect('/coach/availability?error=Invalid+pay+period')
  }

  const { error } = await supabase
    .from('coaches')
    .update({ pay_period: result.data })
    .eq('id', coachId)

  if (error) {
    redirect(`/coach/availability?error=${encodeURIComponent('Failed to update pay period')}`)
  }

  revalidatePath('/coach/availability')
  redirect('/coach/availability')
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

  // Notify parent
  const { data: parentRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('family_id', booking.family_id)
    .eq('role', 'parent')
    .limit(1)
    .single()

  if (parentRole) {
    const { sendPushToUser } = await import('@/lib/push/send')
    try {
      await sendPushToUser(parentRole.user_id, {
        title: 'Private Lesson Confirmed',
        body: 'Your booking has been confirmed by the coach',
        url: '/parent/bookings',
      })
    } catch { /* non-blocking */ }
  }

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

  // Notify parent
  const { data: parentRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('family_id', booking.family_id)
    .eq('role', 'parent')
    .limit(1)
    .single()

  if (parentRole) {
    const { sendPushToUser } = await import('@/lib/push/send')
    try {
      await sendPushToUser(parentRole.user_id, {
        title: 'Booking Declined',
        body: 'Your private lesson request was not accepted',
        url: '/parent/bookings',
      })
    } catch { /* non-blocking */ }
  }

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
