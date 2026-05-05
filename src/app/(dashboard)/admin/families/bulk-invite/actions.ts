'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getSessionUser, requireAdmin } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/notifications/send-invitation'

export interface BulkInviteFailure {
  familyId: string
  reason: string
}

export interface BulkInviteResult {
  ok: boolean
  sent: number
  resent: number
  skipped: number
  failed: BulkInviteFailure[]
}

/**
 * Plan 22-ish — bulk-send onboarding invitations to a list of families.
 *
 * For each familyId:
 *   - If a parent user_role already exists for the family → skip (already signed up).
 *   - Else if a pending invitation exists → re-fire the email (no new row).
 *   - Else → insert a new invitation row (with primary_contact email)
 *     and fire the branded Resend email.
 *
 * Email failures are caught per-family so one bad address doesn't kill the
 * batch. The DB write succeeds first; email is fire-and-forget. Returns a
 * structured summary the client renders inline.
 */
export async function bulkSendInvitations(familyIds: string[]): Promise<BulkInviteResult> {
  await requireAdmin()
  const supabase = await createClient()
  const user = await getSessionUser()

  const result: BulkInviteResult = { ok: true, sent: 0, resent: 0, skipped: 0, failed: [] }

  if (familyIds.length === 0) return result

  for (const familyId of familyIds) {
    try {
      const { data: family, error: famErr } = await supabase
        .from('families')
        .select('id, status, primary_contact')
        .eq('id', familyId)
        .single()

      if (famErr || !family) {
        result.failed.push({ familyId, reason: 'Family not found' })
        continue
      }

      if (family.status !== 'active') {
        result.failed.push({ familyId, reason: `Family status is ${family.status}` })
        continue
      }

      const contact = family.primary_contact as { email?: string } | null
      const email = contact?.email?.trim()
      if (!email) {
        result.failed.push({ familyId, reason: 'No email on primary_contact' })
        continue
      }

      const { count: parentRoleCount } = await supabase
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('family_id', familyId)
        .eq('role', 'parent')

      if ((parentRoleCount ?? 0) > 0) {
        result.skipped++
        continue
      }

      const { data: existing } = await supabase
        .from('invitations')
        .select('id, expires_at')
        .eq('family_id', familyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing) {
        const expiresAt = existing.expires_at ? new Date(existing.expires_at as string) : null
        const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false
        if (!isExpired) {
          try {
            await sendInvitationEmail({ invitationId: existing.id })
            result.resent++
          } catch (e) {
            console.error('[bulk-invite] resend failed', familyId, e)
            result.failed.push({ familyId, reason: 'Email send failed (resend)' })
          }
          continue
        }
      }

      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: inserted, error: insertErr } = await supabase
        .from('invitations')
        .insert({
          family_id: familyId,
          email,
          token,
          status: 'pending',
          created_by: user?.id,
          expires_at: expiresAt,
        })
        .select('id')
        .single()

      if (insertErr || !inserted) {
        result.failed.push({ familyId, reason: insertErr?.message ?? 'Insert failed' })
        continue
      }

      try {
        await sendInvitationEmail({ invitationId: inserted.id })
        result.sent++
      } catch (e) {
        console.error('[bulk-invite] email send failed', familyId, e)
        result.failed.push({ familyId, reason: 'Invitation row created but email send failed' })
      }
    } catch (e) {
      console.error('[bulk-invite] unexpected error', familyId, e)
      result.failed.push({ familyId, reason: e instanceof Error ? e.message : 'Unknown error' })
    }
  }

  result.ok = result.failed.length === 0
  revalidatePath('/admin/families/bulk-invite')
  revalidatePath('/admin/families')
  return result
}
