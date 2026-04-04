import { notFound } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'

export default async function FamilyStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdmin()
  const supabase = await createClient()

  const [{ data: family }, { data: balance }, { data: charges }, { data: payments }] = await Promise.all([
    supabase.from('families').select('display_id, family_name').eq('id', id).single(),
    supabase.from('family_balance').select('balance_cents, confirmed_balance_cents, projected_balance_cents').eq('family_id', id).single(),
    supabase.from('charges').select('*, sessions:session_id(date, status)').eq('family_id', id).in('status', ['pending', 'confirmed']).order('created_at', { ascending: true }),
    supabase.from('payments').select('*').eq('family_id', id).eq('status', 'received').order('created_at', { ascending: true }),
  ])

  if (!family) notFound()

  // Interleave charges and payments by date for a chronological ledger
  type LedgerEntry = {
    date: string
    description: string
    debit: number // charge (positive amount)
    credit: number // payment or credit charge
    type: 'charge' | 'payment'
    sessionStatus?: string | null
  }

  const entries: LedgerEntry[] = []

  for (const c of charges ?? []) {
    const session = c.sessions as unknown as { date: string; status: string } | null
    if (c.amount_cents >= 0) {
      entries.push({
        date: c.created_at ?? '',
        description: c.description,
        debit: c.amount_cents,
        credit: 0,
        type: 'charge',
        sessionStatus: session?.status ?? null,
      })
    } else {
      entries.push({
        date: c.created_at ?? '',
        description: c.description,
        debit: 0,
        credit: Math.abs(c.amount_cents),
        type: 'charge',
        sessionStatus: session?.status ?? null,
      })
    }
  }

  for (const p of payments ?? []) {
    entries.push({
      date: p.created_at ?? p.received_at ?? '',
      description: p.description || `Payment (${p.payment_method.replace('_', ' ')})`,
      debit: 0,
      credit: p.amount_cents,
      type: 'payment',
    })
  }

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Running balance
  let runningBalance = 0
  const ledger = entries.map(e => {
    runningBalance += e.debit - e.credit
    return { ...e, balance: runningBalance }
  })

  const totalCharges = entries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0)

  return (
    <div className="max-w-4xl print:max-w-none">
      <PageHeader
        title={`Statement — ${family.display_id} ${family.family_name}`}
        breadcrumbs={[
          { label: 'Families', href: '/admin/families' },
          { label: family.family_name, href: `/admin/families/${id}` },
        ]}
      />

      <div className="mt-6 space-y-6">
        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-xs font-medium text-muted-foreground">Total Charges</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(totalCharges)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-xs font-medium text-muted-foreground">Total Payments & Credits</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-success">{formatCurrency(totalCredits)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-xs font-medium text-muted-foreground">Current Balance</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${
                (balance?.confirmed_balance_cents ?? 0) < 0 ? 'text-danger' :
                (balance?.confirmed_balance_cents ?? 0) > 0 ? 'text-success' : 'text-foreground'
              }`}>
                {formatCurrency(balance?.confirmed_balance_cents ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Completed sessions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-xs font-medium text-muted-foreground">Upcoming Balance</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${
                (balance?.projected_balance_cents ?? 0) < 0 ? 'text-danger' :
                (balance?.projected_balance_cents ?? 0) > 0 ? 'text-success' : 'text-foreground'
              }`}>
                {formatCurrency(balance?.projected_balance_cents ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Including future bookings</p>
            </CardContent>
          </Card>
        </div>

        {/* Ledger */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Transaction Ledger</h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Description</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Session</th>
                    <th className="pb-2 pr-4 text-right font-medium text-muted-foreground">Charge</th>
                    <th className="pb-2 pr-4 text-right font-medium text-muted-foreground">Credit</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-4 text-muted-foreground tabular-nums">
                        {formatDate(entry.date)}
                      </td>
                      <td className="py-2 pr-4 text-foreground">{entry.description}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {entry.sessionStatus === 'completed' && <span className="text-success">Completed</span>}
                        {entry.sessionStatus === 'scheduled' && <span className="text-primary">Scheduled</span>}
                        {entry.sessionStatus === 'rained_out' && <span className="text-warning">Rained out</span>}
                        {entry.sessionStatus === 'cancelled' && <span className="text-danger">Cancelled</span>}
                        {entry.type === 'payment' && <span className="text-success">Payment</span>}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : ''}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-success">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : ''}
                      </td>
                      <td className={`py-2 text-right tabular-nums font-medium ${
                        entry.balance < 0 ? 'text-danger' : entry.balance > 0 ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted-foreground">
                        No transactions recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center print:mt-8">
          Statement generated {formatDate(new Date().toISOString())} - Sunrise Tennis
        </p>
      </div>
    </div>
  )
}
