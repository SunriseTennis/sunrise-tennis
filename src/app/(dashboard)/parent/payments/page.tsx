import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CreditCard } from 'lucide-react'

export default async function ParentPaymentsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  const familyId = userRole?.family_id
  if (!familyId) {
    return (
      <div>
        <PageHeader title="Payments" />
        <p className="mt-4 text-sm text-muted-foreground">
          No family account linked. This is how parents see their payment history.
        </p>
      </div>
    )
  }

  const [
    { data: balance },
    { data: payments },
    { data: invoices },
  ] = await Promise.all([
    supabase.from('family_balance').select('balance_cents').eq('family_id', familyId).single(),
    supabase
      .from('payments')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('invoices')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const balanceCents = balance?.balance_cents ?? 0

  return (
    <div>
      <PageHeader
        title="Payments & Invoices"
        description="Your payment history and outstanding invoices."
        action={
          <div className={`rounded-lg border px-4 py-3 text-center ${
            balanceCents < 0 ? 'border-danger/20 bg-danger-light' :
            balanceCents > 0 ? 'border-success/20 bg-success-light' :
            'border-border bg-card'
          }`}>
            <p className="text-xs font-medium text-muted-foreground">Account Balance</p>
            <p className={`text-2xl font-bold tabular-nums ${
              balanceCents < 0 ? 'text-danger' :
              balanceCents > 0 ? 'text-success' :
              'text-foreground'
            }`}>
              {formatCurrency(balanceCents)}
            </p>
          </div>
        }
      />

      {/* Outstanding Invoices */}
      {invoices && invoices.filter(i => i.status !== 'paid' && i.status !== 'void').length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Outstanding Invoices</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices
                  .filter(i => i.status !== 'paid' && i.status !== 'void')
                  .map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.display_id}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(invoice.amount_cents)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invoice.due_date ? formatDate(invoice.due_date) : '-'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Payment History</h2>
        {payments && payments.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {payment.created_at ? formatDate(payment.created_at) : '-'}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={CreditCard}
              title="No payments recorded yet"
              description="Your payment history will appear here."
            />
          </div>
        )}
      </div>
    </div>
  )
}
