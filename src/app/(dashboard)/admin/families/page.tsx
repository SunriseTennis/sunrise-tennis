import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Users, Plus } from 'lucide-react'
import { FamiliesTable } from './families-table'

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
    <div>
      <PageHeader
        title="Families"
        action={
          <Button asChild>
            <Link href="/admin/families/new">
              <Plus className="size-4" />
              Add family
            </Link>
          </Button>
        }
      />

      {rows.length > 0 ? (
        <FamiliesTable families={rows} />
      ) : (
        <div className="mt-6">
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
        </div>
      )}
    </div>
  )
}
