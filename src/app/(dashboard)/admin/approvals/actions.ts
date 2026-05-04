'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { validateFormData } from '@/lib/utils/validation'

const noteSchema = z.object({
  note: z.string().trim().min(1, 'Note required').max(1000),
})

const optionalNoteSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal('')),
})

async function familyContextForNotification(familyId: string) {
  const supabase = await createClient()
  const { data: family } = await supabase
    .from('families')
    .select('family_name')
    .eq('id', familyId)
    .single()
  return { familyName: family?.family_name ?? 'Your family' }
}

export async function approveFamilyAction(familyId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, optionalNoteSchema)
  if (!parsed.success) {
    redirect(`/admin/approvals/${familyId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { data: result, error } = await supabase.rpc('approve_family', {
    p_family_id: familyId,
    p_note: parsed.data.note ? parsed.data.note : undefined,
  })

  if (error || (result as { success?: boolean } | null)?.success === false) {
    console.error('[admin/approvals] approve_family:', error, result)
    redirect(`/admin/approvals/${familyId}?error=Approval+failed`)
  }

  // Fire 'you're in' notification to the family.
  try {
    const ctx = await familyContextForNotification(familyId)
    await dispatchNotification('family.approval.granted', { familyId, ...ctx })
  } catch (e) { console.error('[admin/approvals] dispatch:', e) }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin')
  redirect('/admin/approvals?success=Family+approved')
}

export async function requestChangesAction(familyId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, noteSchema)
  if (!parsed.success) {
    redirect(`/admin/approvals/${familyId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { data: result, error } = await supabase.rpc('request_family_changes', {
    p_family_id: familyId,
    p_note: parsed.data.note,
  })

  if (error || (result as { success?: boolean } | null)?.success === false) {
    console.error('[admin/approvals] request_family_changes:', error, result)
    redirect(`/admin/approvals/${familyId}?error=Request+failed`)
  }

  try {
    const ctx = await familyContextForNotification(familyId)
    await dispatchNotification('family.approval.changes_requested', {
      familyId,
      adminNote: parsed.data.note,
      ...ctx,
    })
  } catch (e) { console.error('[admin/approvals] dispatch:', e) }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin')
  redirect('/admin/approvals?success=Changes+requested')
}

/**
 * Plan 17 Block D — re-fire the family.approval.granted notification for
 * an already-approved family. Used to backfill the welcome experience
 * for early self-signup families approved before the email channel was
 * wired (Maxi Testing, Taryn Wilson). Re-fires ALL channels per the
 * rule's current channel list (push + in_app + email).
 */
export async function resendApprovalNotification(familyId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: family } = await supabase
    .from('families')
    .select('family_name, approval_status')
    .eq('id', familyId)
    .single()

  if (!family || family.approval_status !== 'approved') {
    redirect(`/admin/approvals/${familyId}?error=Family+is+not+approved`)
  }

  try {
    await dispatchNotification('family.approval.granted', {
      familyId,
      familyName: family.family_name ?? 'Your family',
    })
  } catch (e) {
    console.error('[admin/approvals] resend dispatch:', e)
  }

  redirect(`/admin/approvals/${familyId}?success=Welcome+notification+resent`)
}

export async function rejectFamilyAction(familyId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, noteSchema)
  if (!parsed.success) {
    redirect(`/admin/approvals/${familyId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { data: result, error } = await supabase.rpc('reject_family', {
    p_family_id: familyId,
    p_reason: parsed.data.note,
  })

  if (error || (result as { success?: boolean } | null)?.success === false) {
    console.error('[admin/approvals] reject_family:', error, result)
    redirect(`/admin/approvals/${familyId}?error=Reject+failed`)
  }

  try {
    const ctx = await familyContextForNotification(familyId)
    await dispatchNotification('family.approval.rejected', { familyId, ...ctx })
  } catch (e) { console.error('[admin/approvals] dispatch:', e) }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin')
  redirect('/admin/approvals?success=Family+rejected')
}
