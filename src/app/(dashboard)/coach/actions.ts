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
