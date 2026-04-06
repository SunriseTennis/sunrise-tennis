import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { RecordPaymentForm } from './record-payment-form'
import { ConfirmPaymentButton } from './confirm-payment-button'
import { VoidPaymentButton } from './void-payment-button'
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
import { CreditCard, AlertCircle, Bell, Ticket, ChevronRight } from 'lucide-react'
import { sendOverdueReminders } from './actions'

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; filter?: string }>
}) {
  const { error, success, filter } = await searchParams
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

  // Compute total pending amount for hero
  const pendingTotal = (payments ?? [])
    .filter(p => p.status === 'pending' || p.status === 'received')
    .reduce((sum, p) => sum + p.amount_cents, 0)

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">Admin</p>
            <h1 className="text-2xl font-bold">Payments</h1>
            <p className="mt-0.5 text-sm text-white/70">Record payments and manage invoices</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-white/70">{showAll ? 'Shown' : 'Pending'}</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(pendingTotal)}</p>
            <div className="mt-1 flex flex-wrap justify-end gap-1.5">
              <Link
                href="/admin/payments/invoices"
                className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
              >
                Invoices <ChevronRight className="size-3" />
              </Link>
              <Link
                href="/admin/vouchers"
                className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
              >
                <Ticket className="size-3" /> Vouchers
              </Link>
              <Link
                href="/admin/payments/bulk"
                className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
              >
                Bulk Record <ChevronRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div className="animate-fade-up flex flex-wrap items-center gap-2" style={{ animationDelay: '80ms' }}>
        <form action={sendOverdueReminders} className="inline">
          <Button type="submit" variant="outline" size="default">
            <Bell className="mr-1.5 size-4" /> Send Reminders
          </Button>
        </form>
        <Button asChild variant="outline">
          <Link href={showAll ? '/admin/payments' : '/admin/payments?filter=all'}>
            {showAll ? 'Recent' : 'Show all'}
          </Link>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      {/* ── Payments Table ── */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        {payments && payments.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#FFF6ED] hover:bg-[#FFF6ED]">
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
                    <TableRow key={payment.id} className="hover:bg-[#FFFBF7]">
                      <TableCell>
                        {payment.created_at ? formatDate(payment.created_at) : '-'}
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/families/${payment.family_id}`} className="font-medium hover:text-primary transition-colors">
                          {family?.display_id} ({family?.family_name})
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-blue">
                        {payment.description || payment.category || '-'}
                      </TableCell>
                      <TableCell className="capitalize text-slate-blue">
                        {payment.payment_method.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-success">
                        {formatCurrency(payment.amount_cents)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={payment.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {payment.status === 'pending' && (
                            <ConfirmPaymentButton paymentId={payment.id} />
                          )}
                          {payment.status !== 'voided' && (
                            <VoidPaymentButton paymentId={payment.id} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={CreditCard}
            title="No payments recorded yet"
            description="Payments will appear here once recorded."
          />
        )}
      </section>

      {/* ── Record Payment Form ── */}
      <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <RecordPaymentForm families={families ?? []} />
      </section>
    </div>
  )
}
