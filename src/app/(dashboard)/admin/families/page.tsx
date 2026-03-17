import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
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
import { Users, Plus } from 'lucide-react'

export default async function FamiliesPage() {
  const supabase = await createClient()

  const { data: families } = await supabase
    .from('families')
    .select('id, display_id, family_name, primary_contact, status, family_balance(balance_cents)')
    .order('display_id')

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

      {families && families.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>ID</TableHead>
                <TableHead>Family Name</TableHead>
                <TableHead>Primary Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {families.map((f) => {
                const contact = f.primary_contact as { name?: string; phone?: string; email?: string } | null
                const balanceRow = f.family_balance as unknown as { balance_cents: number } | null
                const balance = balanceRow?.balance_cents ?? 0
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/families/${f.id}`} className="hover:text-primary transition-colors">
                        {f.display_id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/families/${f.id}`} className="font-medium hover:text-primary transition-colors">
                        {f.family_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact?.name}{contact?.phone ? ` - ${contact.phone}` : ''}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={f.status ?? 'active'} />
                    </TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${balance < 0 ? 'text-danger' : 'text-foreground'}`}>
                      {balance !== 0 ? formatCurrency(balance) : '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
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
