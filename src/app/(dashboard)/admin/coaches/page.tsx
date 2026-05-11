import Link from 'next/link'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { deriveSessionCoachPay, attendanceMapForSessions, keyForSessionCoach, sessionDurationMin } from '@/lib/utils/coach-pay'
import { getCurrentTermRange } from '@/lib/utils/school-terms'
import { formatTime } from '@/lib/utils/dates'
import { Card, CardContent } from '@/components/ui/card'
import { RecordPaymentForm } from '../../admin/privates/earnings/record-payment-form'
import { CreateCoachButton } from './create-coach-button'
import { Clock, Users, DollarSign, GraduationCap, ChevronRight } from 'lucide-react'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  await requireAdmin()
  const supabase = await createClient()
  const { start: termStart, end: termEnd } = getCurrentTermRange(new Date())

  const [
    { data: coaches },
    { data: availability },
    { data: programCoaches },
    { data: earnings },
    { data: completedSessions },
    { data: scheduledSessions },
    { data: payments },
  ] = await Promise.all([
    supabase.from('coaches').select('id, name, is_owner, status, pay_period, hourly_rate, delivers_privates').eq('status', 'active').order('name'),
    supabase.from('coach_availability').select('coach_id, day_of_week, start_time, end_time').order('day_of_week').order('start_time'),
    supabase.from('program_coaches').select('program_id, coach_id, role, programs:program_id(name, day_of_week, start_time)'),
    supabase.from('coach_earnings').select('coach_id, amount_cents, status'),
    supabase.from('sessions')
      .select('id, program_id, coach_id, start_time, end_time, status')
      .eq('status', 'completed')
      .gte('date', termStart)
      .lte('date', termEnd),
    supabase.from('sessions')
      .select('id, coach_id, status')
      .eq('status', 'scheduled')
      .gte('date', termStart)
      .lte('date', termEnd),
    supabase.from('coach_payments')
      .select('id, coach_id, amount_cents, pay_period_key, notes, paid_at')
      .order('paid_at', { ascending: false })
      .limit(20),
  ])

  // Coach attendance rows for this term's completed sessions
  type SessionCoachAttRow = { session_id: string; coach_id: string; status: string; actual_minutes: number | null; note: string | null }
  const completedSessionIds = (completedSessions ?? []).map(s => s.id)
  const { data: sessionCoachAttRowsRaw } = completedSessionIds.length > 0
    ? await supabase
        .from('session_coach_attendances')
        .select('session_id, coach_id, status, actual_minutes, note')
        .in('session_id', completedSessionIds)
    : { data: [] }
  const coachAttByKey = attendanceMapForSessions((sessionCoachAttRowsRaw as unknown as SessionCoachAttRow[] | null) ?? [])

  // Group availability by coach
  const coachAvailability = new Map<string, typeof availability>()
  for (const a of availability ?? []) {
    const existing = coachAvailability.get(a.coach_id) ?? []
    existing.push(a)
    coachAvailability.set(a.coach_id, existing)
  }

  // Group program assignments by coach
  const coachPrograms = new Map<string, { name: string; day: number | null; time: string | null; role: string }[]>()
  for (const pc of programCoaches ?? []) {
    const prog = pc.programs as unknown as { name: string; day_of_week: number | null; start_time: string | null } | null
    if (!prog) continue
    const existing = coachPrograms.get(pc.coach_id) ?? []
    existing.push({ name: prog.name, day: prog.day_of_week, time: prog.start_time, role: pc.role })
    coachPrograms.set(pc.coach_id, existing)
  }

  // Build per-coach data
  const allProgramCoaches = programCoaches ?? []
  const coachCards = (coaches ?? []).filter(c => !c.is_owner).map(coach => {
    const rateJson = (coach.hourly_rate ?? {}) as {
      group_rate_cents?: number
      private_rate_cents?: number
      client_private_rate_cents?: number | null
    }
    const groupRate = rateJson.group_rate_cents ?? 0
    const privateRate = rateJson.private_rate_cents ?? 0
    const clientPrivateRate = rateJson.client_private_rate_cents ?? null
    const windows = coachAvailability.get(coach.id) ?? []
    const programs = coachPrograms.get(coach.id) ?? []
    const coachEarnings = (earnings ?? []).filter(e => e.coach_id === coach.id)
    const owed = coachEarnings.filter(e => e.status === 'owed').reduce((s, e) => s + e.amount_cents, 0)
    const paid = coachEarnings.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount_cents, 0)

    // Session counts this term — partial-attendance aware via deriveSessionCoachPay
    let groupPay = 0
    for (const s of completedSessions ?? []) {
      const isAssigned = allProgramCoaches.some(pc => pc.program_id === s.program_id && pc.coach_id === coach.id)
      const isDirect = s.coach_id === coach.id
      if (!isAssigned && !isDirect) continue
      const durationMin = sessionDurationMin(s.start_time, s.end_time)
      const att = coachAttByKey.get(keyForSessionCoach(s.id, coach.id))
      const { payCents } = deriveSessionCoachPay({ rateCents: groupRate || null, durationMin, attendance: att })
      groupPay += payCents
    }

    const completedCount = (completedSessions ?? []).filter(s =>
      allProgramCoaches.some(pc => pc.program_id === s.program_id && pc.coach_id === coach.id) || s.coach_id === coach.id
    ).length
    const upcomingCount = (scheduledSessions ?? []).filter(s => s.coach_id === coach.id).length

    return {
      ...coach,
      groupRate,
      privateRate,
      clientPrivateRate,
      windows,
      programs,
      owed,
      paid,
      groupPay,
      completedCount,
      upcomingCount,
    }
  })

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Admin</p>
            <h1 className="text-2xl font-bold">Coaches</h1>
            <p className="mt-0.5 text-sm text-white/70">{coachCards.length} active {coachCards.length === 1 ? 'coach' : 'coaches'}</p>
          </div>
          <div className="flex items-center gap-2">
            <CreateCoachButton />
            <Link
              href="/admin/coaches/availability"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
            >
              Manage Availability <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          {decodeURIComponent(error)}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          {decodeURIComponent(success)}
        </div>
      )}

      {/* ── Coach Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {coachCards.map((coach, i) => (
          <Link
            key={coach.id}
            href={`/admin/coaches/${coach.id}`}
            className="animate-fade-up block"
            style={{ animationDelay: `${(i + 1) * 80}ms` }}
          >
            <Card className="overflow-hidden border-[#F0B8B0]/60 bg-[#FFFBF7] transition-all hover:shadow-elevated hover:scale-[1.01]">
              <CardContent className="p-0">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#F0B8B0]/40 bg-[#FFF6ED] px-4 py-3">
                  <div>
                    <p className="font-semibold text-deep-navy">{coach.name}</p>
                    <p className="text-xs text-slate-blue">
                      {coach.pay_period === 'end_of_term' ? 'Term pay' : coach.pay_period === 'fortnightly' ? 'Fortnightly' : 'Weekly'}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-blue">
                    {coach.groupRate > 0 && <p>Group: {formatCurrency(coach.groupRate)}/hr</p>}
                    {coach.privateRate > 0 && <p>Pay: {formatCurrency(coach.privateRate)}/hr</p>}
                    {coach.clientPrivateRate != null
                      ? <p>Parent: {formatCurrency(coach.clientPrivateRate)}/hr</p>
                      : (coach.delivers_privates !== false && <p className="text-warning">Parent rate not set</p>)
                    }
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  {/* Availability */}
                  {coach.windows.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Clock className="mt-0.5 size-3.5 shrink-0 text-[#2B5EA7]" />
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-blue">
                        {coach.windows.map((w, idx) => (
                          <span key={idx}>{DAY_NAMES[w.day_of_week]} {formatTime(w.start_time)}-{formatTime(w.end_time)}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Programs */}
                  {coach.programs.length > 0 && (
                    <div className="flex items-start gap-2">
                      <GraduationCap className="mt-0.5 size-3.5 shrink-0 text-[#2B5EA7]" />
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-blue">
                        {coach.programs.map((p, idx) => (
                          <span key={idx}>
                            {p.name}
                            {p.role !== 'primary' && <span className="ml-0.5 text-[10px] opacity-60">(A)</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-start gap-2">
                    <Users className="mt-0.5 size-3.5 shrink-0 text-[#2B5EA7]" />
                    <span className="text-xs text-slate-blue">
                      {coach.completedCount} completed · {coach.upcomingCount} upcoming
                    </span>
                  </div>

                  {/* Pay */}
                  <div className="flex items-start gap-2">
                    <DollarSign className="mt-0.5 size-3.5 shrink-0 text-[#2B5EA7]" />
                    <div className="flex flex-wrap gap-x-3 text-xs">
                      {coach.groupPay > 0 && <span className="text-slate-blue">Group: {formatCurrency(coach.groupPay)}</span>}
                      {coach.owed > 0 && <span className="text-orange-600">Owed: {formatCurrency(coach.owed)}</span>}
                      {coach.paid > 0 && <span className="text-success">Paid: {formatCurrency(coach.paid)}</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Record Payment Form ── */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <RecordPaymentForm coaches={coachCards.map(c => ({ id: c.id, name: c.name, owed: c.owed }))} />
      </section>

      {/* ── Recent Payments ── */}
      {(payments ?? []).length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
          <h2 className="mb-3 text-sm font-semibold text-slate-blue">Recent Payments</h2>
          <div className="overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
            <div className="divide-y divide-[#F0B8B0]/40">
              {(payments ?? []).map(p => {
                const coach = coaches?.find(c => c.id === p.coach_id)
                return (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-deep-navy">{coach?.name ?? 'Unknown'}</p>
                      <p className="text-xs text-slate-blue">
                        {formatCurrency(p.amount_cents)} · {p.pay_period_key}
                        {p.notes && ` · ${p.notes}`}
                      </p>
                    </div>
                    <p className="text-xs text-slate-blue">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-AU') : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
