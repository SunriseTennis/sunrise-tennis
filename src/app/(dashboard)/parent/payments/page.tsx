import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
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
import { CreditCard, FileText, ChevronRight, Ticket } from 'lucide-react'
import { PaymentOptions } from './payment-options'
import { ChargesList } from './charges-list'
import { VoucherForm } from './voucher-form'
import { BalanceHero } from './balance-hero'
import { PaymentDetailRow } from './payment-detail-row'

export default async function ParentPaymentsPage() {
  const supabase = await createClient()

  const user = await getSessionUser()
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
      <div className="mt-6">
        <EmptyState
          icon={CreditCard}
          title="No family account linked"
          description="This is how parents see their payment history."
        />
      </div>
    )
  }

  const [balanceRes, paymentsRes, invoicesRes, chargesRes, vouchersRes] = await Promise.all([
    supabase.from('family_balance').select('balance_cents, confirmed_balance_cents, projected_balance_cents').eq('family_id', familyId).single(),
    supabase.from('payments').select('*, payment_allocations(amount_cents, charge_id, charges:charge_id(description, session_id, sessions:session_id(date, status)))').eq('family_id', familyId).neq('status', 'voided').order('created_at', { ascending: false }).limit(20),
    supabase.from('invoices').select('*').eq('family_id', familyId).order('created_at', { ascending: false }).limit(20),
    supabase.from('charges').select('id, type, source_type, description, amount_cents, status, program_id, session_id, player_id, created_at, sessions:session_id(date, status), players:player_id(first_name)').eq('family_id', familyId).in('status', ['pending', 'confirmed']).order('created_at', { ascending: false }).limit(100),
    supabase.from('vouchers').select('id, voucher_code, voucher_type, amount_cents, status, submitted_at').eq('family_id', familyId).order('submitted_at', { ascending: false }).limit(10),
  ])

  const balance = balanceRes.data
  const payments = paymentsRes.data
  const invoices = invoicesRes.data
  const charges = chargesRes.data
  const vouchers = vouchersRes.data

  // Enrich charges with program names + types
  const programIds = [...new Set((charges ?? []).filter(c => c.program_id).map(c => c.program_id!))]
  let programInfo: Record<string, { name: string; type: string }> = {}
  if (programIds.length > 0) {
    const { data: programs } = await supabase
      .from('programs')
      .select('id, name, type')
      .in('id', programIds)
    if (programs) {
      programInfo = Object.fromEntries(programs.map(p => [p.id, { name: p.name, type: p.type }]))
    }
  }
  const enrichedCharges = (charges ?? []).map(c => {
    const session = c.sessions as unknown as { date: string; status: string } | null
    const player = c.players as unknown as { first_name: string } | null
    const info = c.program_id ? programInfo[c.program_id] : null
    return {
      id: c.id,
      type: c.type,
      source_type: c.source_type,
      description: c.description,
      amount_cents: c.amount_cents,
      status: c.status,
      program_id: c.program_id,
      session_id: c.session_id,
      player_id: c.player_id,
      created_at: c.created_at,
      program_name: info?.name ?? null,
      program_type: info?.type ?? null,
      player_name: player?.first_name ?? null,
      session_date: session?.date ?? null,
      session_status: session?.status ?? null,
    }
  })

  const confirmedBalanceCents = balance?.confirmed_balance_cents ?? 0
  const projectedBalanceCents = balance?.projected_balance_cents ?? 0
  const outstandingInvoices = invoices?.filter(i => i.status !== 'paid' && i.status !== 'void') ?? []
  const hasOutstandingBalance = projectedBalanceCents < 0

  return (
    <div className="space-y-6">
      {/* ── Balance Hero ── */}
      <BalanceHero
        confirmedBalanceCents={confirmedBalanceCents}
        projectedBalanceCents={projectedBalanceCents}
      />

      {/* ── Itemised Charges ── */}
      {enrichedCharges.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <ChargesList charges={enrichedCharges} />
        </section>
      )}

      {/* ── Outstanding Invoices ── */}
      {outstandingInvoices.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <h2 className="text-lg font-semibold text-foreground">Outstanding Invoices</h2>

          {/* Mobile cards */}
          <div className="mt-3 space-y-3 md:hidden">
            {outstandingInvoices.map((invoice) => (
              <div key={invoice.id} className="rounded-xl border border-warning/20 bg-warning-light/50 p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-warning" />
                    <p className="font-medium text-foreground">{invoice.display_id}</p>
                  </div>
                  <StatusBadge status={invoice.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : 'No due date'}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{formatCurrency(invoice.amount_cents)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card shadow-card md:block">
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
                {outstandingInvoices.map((invoice) => (
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
        </section>
      )}

      {/* ── Make a Payment ── */}
      {hasOutstandingBalance && (
        <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
          <PaymentOptions
            familyId={familyId}
            balanceCents={projectedBalanceCents}
            outstandingInvoices={outstandingInvoices.map(i => ({
              id: i.id,
              display_id: i.display_id,
              amount_cents: i.amount_cents,
            }))}
          />
        </section>
      )}

      {/* ── Sports Voucher ── */}
      <section className="animate-fade-up" style={{ animationDelay: '220ms' }}>
        <VoucherForm />
        {vouchers && vouchers.length > 0 && (
          <div className="mt-3 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Submitted Vouchers</h3>
            {vouchers.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Ticket className="size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{v.voucher_code}</p>
                    <p className="text-xs capitalize text-muted-foreground">{v.voucher_type.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-foreground">{formatCurrency(v.amount_cents)}</span>
                  <StatusBadge status={v.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Payment History ── */}
      <section className="animate-fade-up" style={{ animationDelay: '300ms' }}>
        <h2 className="text-lg font-semibold text-foreground">Payment History</h2>
        {payments && payments.length > 0 ? (
          <div className="mt-3 space-y-2">
            {payments.map((payment) => {
              const allocations = (payment.payment_allocations ?? []) as unknown as {
                amount_cents: number
                charge_id: string
                charges: { description: string; session_id: string | null; sessions: { date: string; status: string } | null } | null
              }[]
              return (
                <PaymentDetailRow
                  key={payment.id}
                  payment={{
                    id: payment.id,
                    date: payment.created_at ?? '',
                    description: payment.description || payment.category || '-',
                    method: payment.payment_method,
                    amountCents: payment.amount_cents,
                    status: payment.status,
                  }}
                  allocations={allocations.map(a => ({
                    amountCents: a.amount_cents,
                    chargeDescription: a.charges?.description ?? 'Unknown charge',
                    sessionDate: a.charges?.sessions?.date ?? null,
                    sessionStatus: a.charges?.sessions?.status ?? null,
                  }))}
                />
              )
            })}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={CreditCard}
              title="No payments recorded yet"
              description="Your payment history will appear here."
              compact
            />
          </div>
        )}
      </section>
    </div>
  )
}
