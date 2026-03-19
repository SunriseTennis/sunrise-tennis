'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { validateFormData, lessonNoteFormSchema, attendanceStatusSchema } from '@/lib/utils/validation'

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
