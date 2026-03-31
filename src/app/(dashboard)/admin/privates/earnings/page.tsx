import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { RecordPaymentForm } from './record-payment-form'

export default async function AdminEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  await requireAdmin()
  const supabase = await createClient()

  // Get all coaches
  const { data: coaches } = await supabase
    .from('coaches')
    .select('id, name, is_owner, pay_period')
    .eq('status', 'active')
    .order('name')

  // Get earnings summary per coach
  const { data: earnings } = await supabase
    .from('coach_earnings')
    .select('coach_id, amount_cents, status')

  // Get recent payments
  const { data: payments } = await supabase
    .from('coach_payments')
    .select('id, coach_id, amount_cents, pay_period_key, notes, paid_at')
    .order('paid_at', { ascending: false })
    .limit(20)

  // Compute per-coach summary
  const coachSummaries = (coaches ?? [])
    .filter(c => !c.is_owner)
    .map(coach => {
      const coachEarnings = (earnings ?? []).filter(e => e.coach_id === coach.id)
      const owed = coachEarnings.filter(e => e.status === 'owed').reduce((s, e) => s + e.amount_cents, 0)
      const paid = coachEarnings.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount_cents, 0)
      return { ...coach, owed, paid, total: owed + paid }
    })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coach Earnings"
        description="Track and record coach payments"
        breadcrumbs={[{ label: 'Privates', href: '/admin/privates' }]}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decodeURIComponent(error)}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {decodeURIComponent(success)}
        </div>
      )}

      {/* Coach summary cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {coachSummaries.map(coach => (
          <Card key={coach.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{coach.name}</p>
                <span className="text-xs text-muted-foreground">
                  {coach.pay_period === 'end_of_term' ? 'Term pay' : 'Weekly pay'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-orange-600">${(coach.owed / 100).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Owed</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-600">${(coach.paid / 100).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Paid</p>
                </div>
                <div>
                  <p className="text-lg font-bold">${(coach.total / 100).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Record payment form */}
      <RecordPaymentForm coaches={coachSummaries.map(c => ({ id: c.id, name: c.name, owed: c.owed }))} />

      {/* Recent payments */}
      {(payments ?? []).length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Recent Payments</h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(payments ?? []).map(p => {
                  const coach = coaches?.find(c => c.id === p.coach_id)
                  return (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{coach?.name ?? 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          ${(p.amount_cents / 100).toFixed(2)} · {p.pay_period_key}
                          {p.notes && ` · ${p.notes}`}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-AU') : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
