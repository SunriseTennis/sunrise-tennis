import { redirect } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { DollarSign } from 'lucide-react'
import { formatDate } from '@/lib/utils/dates'
import { getPayPeriodKey } from '@/lib/utils/private-booking'

export default async function CoachEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period } = await searchParams
  const { coachId } = await requireCoach()
  if (!coachId) return redirect('/coach?error=No+coach+profile+found') as never

  const supabase = await createClient()

  // Get coach info
  const { data: coach } = await supabase
    .from('coaches')
    .select('pay_period')
    .eq('id', coachId)
    .single()

  const payPeriod = coach?.pay_period ?? 'weekly'
  const currentKey = getPayPeriodKey(new Date(), payPeriod)
  const displayPeriod = period || currentKey

  // Get earnings
  const { data: earnings } = await supabase
    .from('coach_earnings')
    .select(`
      id, session_type, amount_cents, duration_minutes,
      pay_period_key, status, created_at,
      sessions:session_id(date, start_time)
    `)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })

  // Get payments
  const { data: payments } = await supabase
    .from('coach_payments')
    .select('id, amount_cents, pay_period_key, notes, paid_at')
    .eq('coach_id', coachId)
    .order('paid_at', { ascending: false })
    .limit(10)

  // Compute totals
  const currentPeriodEarnings = (earnings ?? []).filter(e => e.pay_period_key === displayPeriod)
  const totalOwed = currentPeriodEarnings.filter(e => e.status === 'owed').reduce((sum, e) => sum + e.amount_cents, 0)
  const totalPaid = currentPeriodEarnings.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.amount_cents, 0)
  const totalAllTime = (earnings ?? []).reduce((sum, e) => sum + e.amount_cents, 0)
  const totalAllTimePaid = (earnings ?? []).filter(e => e.status === 'paid').reduce((sum, e) => sum + e.amount_cents, 0)

  // Get unique periods for toggle
  const periods = [...new Set((earnings ?? []).map(e => e.pay_period_key))].sort().reverse()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        description={payPeriod === 'weekly' ? 'Weekly pay summary' : 'End of term pay summary'}
      />

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Owed this period</p>
            <p className="mt-1 text-2xl font-bold text-orange-600">${(totalOwed / 100).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Paid this period</p>
            <p className="mt-1 text-2xl font-bold text-green-600">${(totalPaid / 100).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">All-time earned</p>
            <p className="mt-1 text-2xl font-bold">${(totalAllTime / 100).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">${(totalAllTimePaid / 100).toFixed(2)} paid</p>
          </CardContent>
        </Card>
      </div>

      {/* Period toggle */}
      {periods.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {periods.map(p => (
            <a
              key={p}
              href={`/coach/earnings?period=${p}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                p === displayPeriod ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}

      {/* Earnings table */}
      {currentPeriodEarnings.length === 0 ? (
        <EmptyState icon={DollarSign} title="No earnings" description={`No earnings recorded for ${displayPeriod}`} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {currentPeriodEarnings.map(e => {
                const session = e.sessions as unknown as { date: string; start_time: string } | null
                return (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {session ? formatDate(session.date) : 'Unknown date'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.session_type === 'private' ? 'Private' : 'Group'} · {e.duration_minutes}min
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">${(e.amount_cents / 100).toFixed(2)}</span>
                      <StatusBadge status={e.status} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent payments */}
      {(payments ?? []).length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Payment History</h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(payments ?? []).map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">${(p.amount_cents / 100).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.paid_at ? formatDate(p.paid_at) : ''} · {p.pay_period_key}
                      </p>
                      {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                    </div>
                    <StatusBadge status="paid" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
