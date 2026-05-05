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

/**
 * Plan 21 — Link a self-signup parent to an existing pre-created
 * family (legacy_import / admin_invite). Re-points their user_roles
 * row, drops the transient self-signup family + players, forces
 * re-onboarding on the target. Fires `family.account_linked` so the
 * parent gets a "log in to continue" email.
 */
const linkSchema = z.object({
  target_family_id: z.string().uuid({ message: 'Pick an existing family' }),
})

export async function linkSignupToExistingFamily(
  signupFamilyId: string,
  formData: FormData,
) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, linkSchema)
  if (!parsed.success) {
    redirect(`/admin/approvals/${signupFamilyId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const targetFamilyId = parsed.data.target_family_id
  if (targetFamilyId === signupFamilyId) {
    redirect(`/admin/approvals/${signupFamilyId}?error=Pick+a+different+family`)
  }

  const { data, error } = await supabase.rpc('admin_link_signup_to_family', {
    p_signup_family_id: signupFamilyId,
    p_target_family_id: targetFamilyId,
  })

  if (error) {
    console.error('[admin/approvals] link rpc:', error.message)
    redirect(`/admin/approvals/${signupFamilyId}?error=${encodeURIComponent('Link failed — see logs')}`)
  }

  const result = data as
    | { success: boolean; target_family_id?: string; parent_email?: string; error?: string }
    | null

  if (!result || result.success === false) {
    redirect(`/admin/approvals/${signupFamilyId}?error=${encodeURIComponent(result?.error ?? 'Link failed')}`)
  }

  // Fire `family.account_linked` so the parent gets a push + in-app +
  // email pointing them at /login. The dispatcher reads
  // notification_rules and fans out per channel; familyName is
  // resolved from the target family.
  try {
    const { data: target } = await supabase
      .from('families')
      .select('family_name')
      .eq('id', targetFamilyId)
      .single()
    await dispatchNotification('family.account_linked', {
      familyId: targetFamilyId,
      familyName: target?.family_name ?? 'Sunrise Tennis',
    })
  } catch (e) {
    console.error('[admin/approvals] link dispatch:', e)
  }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin/families')
  revalidatePath(`/admin/families/${targetFamilyId}`)
  redirect(`/admin/families/${targetFamilyId}?success=${encodeURIComponent('Account linked — parent emailed log-in instructions')}`)
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
