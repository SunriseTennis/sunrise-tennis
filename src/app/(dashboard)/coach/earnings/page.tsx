import { redirect } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { DollarSign } from 'lucide-react'
import { formatDate } from '@/lib/utils/dates'
import { getPayPeriodKey } from '@/lib/utils/private-booking'
import { PayPeriodForm } from './pay-period-form'

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
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Earnings</p>
            <h1 className="text-2xl font-bold">{payPeriod === 'weekly' ? 'Weekly Pay' : 'Term Pay'}</h1>
            <p className="mt-0.5 text-sm text-white/70">Period: {displayPeriod}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-white/70">Owed</p>
            <p className="text-2xl font-bold tabular-nums">${(totalOwed / 100).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* ── Pay Period Selector ── */}
      <div className="animate-fade-up flex items-center justify-between rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] p-4 shadow-card" style={{ animationDelay: '40ms' }}>
        <div>
          <p className="text-sm font-semibold text-deep-navy">Pay period</p>
          <p className="text-xs text-slate-blue">How often you prefer to be paid</p>
        </div>
        <PayPeriodForm payPeriod={payPeriod} />
      </div>

      {/* ── Stat Cards ── */}
      <div className="animate-fade-up grid gap-3 sm:grid-cols-3" style={{ animationDelay: '80ms' }}>
        <div className="rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] p-4 shadow-card">
          <p className="text-xs text-slate-blue">Owed this period</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-orange-600">${(totalOwed / 100).toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] p-4 shadow-card">
          <p className="text-xs text-slate-blue">Paid this period</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-green-600">${(totalPaid / 100).toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] p-4 shadow-card">
          <p className="text-xs text-slate-blue">All-time earned</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-deep-navy">${(totalAllTime / 100).toFixed(2)}</p>
          <p className="text-xs text-slate-blue">${(totalAllTimePaid / 100).toFixed(2)} paid</p>
        </div>
      </div>

      {/* ── Period Toggle ── */}
      {periods.length > 1 && (
        <div className="animate-fade-up flex flex-wrap gap-1.5" style={{ animationDelay: '120ms' }}>
          {periods.map(p => (
            <a
              key={p}
              href={`/coach/earnings?period=${p}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                p === displayPeriod ? 'bg-primary text-primary-foreground' : 'bg-[#FFF6ED] text-slate-blue hover:bg-[#FFE8D6]'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}

      {/* ── Earnings List ── */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="text-lg font-semibold text-deep-navy">Sessions</h2>
        {currentPeriodEarnings.length === 0 ? (
          <div className="mt-3">
            <EmptyState icon={DollarSign} title="No earnings" description={`No earnings recorded for ${displayPeriod}`} />
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
            <div className="divide-y divide-[#F0B8B0]/30">
              {currentPeriodEarnings.map(e => {
                const session = e.sessions as unknown as { date: string; start_time: string } | null
                return (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#FFF6ED] transition-colors">
                    <div>
                      <p className="text-sm font-medium text-deep-navy">
                        {session ? formatDate(session.date) : 'Unknown date'}
                      </p>
                      <p className="text-xs text-slate-blue">
                        {e.session_type === 'private' ? 'Private' : 'Group'} · {e.duration_minutes}min
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums text-deep-navy">${(e.amount_cents / 100).toFixed(2)}</span>
                      <StatusBadge status={e.status} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Payment History ── */}
      {(payments ?? []).length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
          <h2 className="text-lg font-semibold text-deep-navy">Payment History</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
            <div className="divide-y divide-[#F0B8B0]/30">
              {(payments ?? []).map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#FFF6ED] transition-colors">
                  <div>
                    <p className="text-sm font-bold tabular-nums text-deep-navy">${(p.amount_cents / 100).toFixed(2)}</p>
                    <p className="text-xs text-slate-blue">
                      {p.paid_at ? formatDate(p.paid_at) : ''} · {p.pay_period_key}
                    </p>
                    {p.notes && <p className="text-xs text-slate-blue">{p.notes}</p>}
                  </div>
                  <StatusBadge status="paid" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
