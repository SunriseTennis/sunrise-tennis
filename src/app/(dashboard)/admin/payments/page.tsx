import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { RecordPaymentForm } from './record-payment-form'
import { ConfirmPaymentButton } from './confirm-payment-button'
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
import { CreditCard, AlertCircle } from 'lucide-react'

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; filter?: string }>
}) {
  const { error, filter } = await searchParams
  const supabase = await createClient()

  const showAll = filter === 'all'

  let query = supabase
    .from('payments')
    .select('*, families:family_id(display_id, family_name)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!showAll) {
    // Default: show only pending payments that need action
    query = query.in('status', ['pending', 'received'])
  }

  const [{ data: payments }, { data: families }] = await Promise.all([
    query,
    supabase.from('families').select('id, display_id, family_name').eq('status', 'active').order('family_name'),
  ])

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Record payments and manage invoices."
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/admin/payments/invoices">Invoices</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={showAll ? '/admin/payments' : '/admin/payments?filter=all'}>
                {showAll ? 'Recent' : 'Show all'}
              </Link>
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {payments && payments.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => {
                const family = payment.families as unknown as { display_id: string; family_name: string } | null
                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {payment.created_at ? formatDate(payment.created_at) : '-'}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/families/${payment.family_id}`} className="font-medium hover:text-primary transition-colors">
                        {family?.display_id} ({family?.family_name})
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.description || payment.category || '-'}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {payment.payment_method.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-success">
                      {formatCurrency(payment.amount_cents)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={payment.status} />
                    </TableCell>
                    <TableCell>
                      {payment.status === 'pending' && (
                        <ConfirmPaymentButton paymentId={payment.id} />
                      )}
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
            icon={CreditCard}
            title="No payments recorded yet"
            description="Payments will appear here once recorded."
          />
        </div>
      )}

      {/* Record payment form */}
      <div className="mt-8">
        <RecordPaymentForm families={families ?? []} />
      </div>
    </div>
  )
}
