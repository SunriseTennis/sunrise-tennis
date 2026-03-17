import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { CreateInvoiceForm } from './create-invoice-form'
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
import { FileText, AlertCircle } from 'lucide-react'

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: invoices }, { data: families }] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, families:family_id(display_id, family_name)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('families').select('id, display_id, family_name').eq('status', 'active').order('family_name'),
  ])

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create and track invoices."
        breadcrumbs={[{ label: 'Payments', href: '/admin/payments' }]}
        action={
          <Button asChild variant="outline">
            <Link href="/admin/payments">Back to Payments</Link>
          </Button>
        }
      />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {invoices && invoices.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Invoice #</TableHead>
                <TableHead>Family</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const family = invoice.families as unknown as { display_id: string; family_name: string } | null
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.display_id}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/families/${invoice.family_id}`} className="font-medium hover:text-primary transition-colors">
                        {family?.display_id} ({family?.family_name})
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(invoice.amount_cents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.due_date ? formatDate(invoice.due_date) : '-'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.sent_at ? formatDate(invoice.sent_at) : '-'}
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
            icon={FileText}
            title="No invoices created yet"
            description="Create an invoice to bill a family."
          />
        </div>
      )}

      <div className="mt-8">
        <CreateInvoiceForm families={families ?? []} />
      </div>
    </div>
  )
}
