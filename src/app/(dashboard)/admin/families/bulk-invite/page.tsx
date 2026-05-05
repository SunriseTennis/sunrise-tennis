import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BulkInviteTable, type BulkInviteRow } from './bulk-invite-table'

export default async function BulkInvitePage() {
  const supabase = await createClient()

  const { data: families } = await supabase
    .from('families')
    .select('id, display_id, family_name, primary_contact, status')
    .eq('status', 'active')
    .order('display_id')

  const familyList = families ?? []
  const familyIds = familyList.map((f) => f.id)

  const { data: parentRoles } = familyIds.length
    ? await supabase
        .from('user_roles')
        .select('family_id')
        .in('family_id', familyIds)
        .eq('role', 'parent')
    : { data: [] as { family_id: string }[] }

  const signedUpSet = new Set((parentRoles ?? []).map((r) => r.family_id as string))

  const { data: pendingInvites } = familyIds.length
    ? await supabase
        .from('invitations')
        .select('id, family_id, email, expires_at, created_at')
        .in('family_id', familyIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    : { data: [] as { id: string; family_id: string; email: string; expires_at: string | null; created_at: string }[] }

  const pendingByFamily = new Map<string, { id: string; email: string; expiresAt: string | null; createdAt: string }>()
  for (const inv of pendingInvites ?? []) {
    if (!pendingByFamily.has(inv.family_id as string)) {
      pendingByFamily.set(inv.family_id as string, {
        id: inv.id as string,
        email: inv.email as string,
        expiresAt: (inv.expires_at as string | null) ?? null,
        createdAt: inv.created_at as string,
      })
    }
  }

  const rows: BulkInviteRow[] = familyList.map((f) => {
    const contact = f.primary_contact as { name?: string; email?: string } | null
    const contactName = contact?.name ?? ''
    const contactEmail = contact?.email?.trim() ?? ''
    const isSignedUp = signedUpSet.has(f.id)
    const pending = pendingByFamily.get(f.id)
    const isPendingExpired = pending?.expiresAt
      ? new Date(pending.expiresAt).getTime() < Date.now()
      : false

    let state: BulkInviteRow['state']
    if (isSignedUp) state = 'signed_up'
    else if (!contactEmail) state = 'no_email'
    else if (pending && !isPendingExpired) state = 'pending_invite'
    else if (pending && isPendingExpired) state = 'expired_invite'
    else state = 'not_invited'

    return {
      id: f.id,
      displayId: (f.display_id as string) ?? '',
      familyName: (f.family_name as string) ?? '',
      contactName,
      contactEmail,
      state,
      pendingExpiresAt: pending?.expiresAt ?? null,
    }
  })

  const eligibleCount = rows.filter(
    (r) => r.state === 'not_invited' || r.state === 'pending_invite' || r.state === 'expired_invite',
  ).length
  const signedUpCount = rows.filter((r) => r.state === 'signed_up').length
  const noEmailCount = rows.filter((r) => r.state === 'no_email').length

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/families"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to families
        </Link>
      </div>

      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative">
          <p className="text-sm font-medium text-white/80">Admin → Families</p>
          <h1 className="text-2xl font-bold">Bulk invite parents</h1>
          <p className="mt-1 text-sm text-white/80">
            Send onboarding invitation emails to active families in one go. Already-signed-up families are auto-detected and locked. Pending invites can be re-sent without creating a new row.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
              {eligibleCount} eligible
            </span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
              {signedUpCount} already signed up
            </span>
            {noEmailCount > 0 && (
              <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                {noEmailCount} missing email
              </span>
            )}
          </div>
        </div>
      </div>

      <BulkInviteTable rows={rows} />
    </div>
  )
}
