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

  const rows = (families ?? []).map((f) => {
    const contact = f.primary_contact as { name?: string; phone?: string; email?: string } | null
    const balanceRow = f.family_balance as unknown as { balance_cents: number; confirmed_balance_cents: number; projected_balance_cents: number } | null
    const players = (f.players ?? []) as { first_name: string; last_name: string }[]
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
