import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Users, UserCheck, GraduationCap, DollarSign, Plus } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [
    { count: familyCount },
    { count: playerCount },
    { count: programCount },
    { data: balances },
  ] = await Promise.all([
    supabase.from('families').select('*', { count: 'exact', head: true }),
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('programs').select('*', { count: 'exact', head: true }),
    supabase.from('family_balance').select('balance_cents, family_id, families(display_id, family_name)')
      .neq('balance_cents', 0)
      .order('balance_cents', { ascending: true }),
  ])

  const totalOutstanding = balances?.reduce((sum, b) => {
    return b.balance_cents < 0 ? sum + b.balance_cents : sum
  }, 0) ?? 0

  return (
    <div>
      <PageHeader title="Overview" description="Business snapshot at a glance." />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Families" value={String(familyCount ?? 0)} href="/admin/families" icon={Users} />
        <StatCard label="Players" value={String(playerCount ?? 0)} icon={UserCheck} />
        <StatCard label="Programs" value={String(programCount ?? 0)} href="/admin/programs" icon={GraduationCap} />
        <StatCard
          label="Outstanding"
          value={totalOutstanding !== 0 ? formatCurrency(totalOutstanding) : '$0.00'}
          variant={totalOutstanding < 0 ? 'danger' : 'default'}
          icon={DollarSign}
        />
      </div>

      {balances && balances.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Account Balances</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Family</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((b) => {
                  const family = b.families as unknown as { display_id: string; family_name: string } | null
                  return (
                    <TableRow key={b.family_id}>
                      <TableCell>
                        <Link href={`/admin/families/${b.family_id}`} className="font-medium hover:text-primary transition-colors">
                          {family?.display_id} ({family?.family_name})
                        </Link>
                      </TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${b.balance_cents < 0 ? 'text-danger' : 'text-success'}`}>
                        {formatCurrency(b.balance_cents)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-auto justify-center border-2 border-dashed p-6">
          <Link href="/admin/families/new" className="flex items-center gap-2">
            <Plus className="size-4" />
            Add new family
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-center border-2 border-dashed p-6">
          <Link href="/admin/programs/new" className="flex items-center gap-2">
            <Plus className="size-4" />
            Add new program
          </Link>
        </Button>
      </div>
    </div>
  )
}
