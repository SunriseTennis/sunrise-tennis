import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Users, Plus, Mail } from 'lucide-react'
import { FamiliesTable } from './families-table'
import { InviteParentModal } from './invite-parent-modal'

export default async function FamiliesPage() {
  const supabase = await createClient()

  const { data: families } = await supabase
    .from('families')
    .select('id, display_id, family_name, primary_contact, status, family_balance(balance_cents, confirmed_balance_cents, projected_balance_cents), players(first_name, last_name)')
    .order('display_id')

  const familyList = families ?? []
  const familyIds = familyList.map((f) => f.id)

  // Mirror the bulk-invite derivation so the connection column is the same
  // signal admin sees on /admin/families/bulk-invite.
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
        .select('family_id, expires_at, created_at')
        .in('family_id', familyIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    : { data: [] as { family_id: string; expires_at: string | null; created_at: string }[] }

  const pendingByFamily = new Map<string, { expiresAt: string | null }>()
  for (const inv of pendingInvites ?? []) {
    const fid = inv.family_id as string
    if (!pendingByFamily.has(fid)) {
      pendingByFamily.set(fid, { expiresAt: (inv.expires_at as string | null) ?? null })
    }
  }

  const rows = familyList.map((f) => {
    const contact = f.primary_contact as { name?: string; phone?: string; email?: string } | null
    const balanceRow = f.family_balance as unknown as { balance_cents: number; confirmed_balance_cents: number; projected_balance_cents: number } | null
    const players = (f.players ?? []) as { first_name: string; last_name: string }[]

    const isSignedUp = signedUpSet.has(f.id)
    const pending = pendingByFamily.get(f.id)
    const isPendingExpired = pending?.expiresAt ? new Date(pending.expiresAt).getTime() < Date.now() : false
    const hasEmail = Boolean(contact?.email?.trim())

    let connectionState: 'connected' | 'invited' | 'invite_expired' | 'not_invited' | 'no_email'
    if (isSignedUp) connectionState = 'connected'
    else if (pending && !isPendingExpired) connectionState = 'invited'
    else if (pending && isPendingExpired) connectionState = 'invite_expired'
    else if (!hasEmail) connectionState = 'no_email'
    else connectionState = 'not_invited'

    return {
      id: f.id,
      displayId: f.display_id,
      familyName: f.family_name,
      contactName: contact?.name ?? '',
      contactPhone: contact?.phone ?? '',
      status: f.status ?? 'active',
      balanceCents: balanceRow?.balance_cents ?? 0,
      confirmedBalanceCents: balanceRow?.confirmed_balance_cents ?? 0,
      projectedBalanceCents: balanceRow?.projected_balance_cents ?? 0,
      playerNames: players.map(p => `${p.first_name} ${p.last_name}`),
      connectionState,
      pendingExpiresAt: pending?.expiresAt ?? null,
    }
  })

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Admin</p>
            <h1 className="text-2xl font-bold">Families</h1>
            <p className="mt-0.5 text-sm text-white/70">{rows.length} {rows.length === 1 ? 'family' : 'families'} registered</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 backdrop-blur-sm">
              <Link href="/admin/families/bulk-invite">
                <Mail className="size-4" />
                Bulk invite
              </Link>
            </Button>
            <InviteParentModal
              families={rows.map(r => ({ id: r.id, display_id: r.displayId, family_name: r.familyName }))}
            />
            <Button asChild className="bg-white/20 text-white border-white/30 hover:bg-white/30 backdrop-blur-sm">
              <Link href="/admin/families/new">
                <Plus className="size-4" />
                Add family
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Families Table ── */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        {rows.length > 0 ? (
          <FamiliesTable families={rows} />
        ) : (
          <EmptyState
            icon={Users}
            title="No families yet"
            description="Add your first family to get started."
            action={
              <Button asChild size="sm">
                <Link href="/admin/families/new">Add family</Link>
              </Button>
            }
          />
        )}
      </section>
    </div>
  )
}
