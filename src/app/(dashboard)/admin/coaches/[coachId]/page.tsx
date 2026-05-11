import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { deriveSessionCoachPay, attendanceMapForSessions, keyForSessionCoach, sessionDurationMin } from '@/lib/utils/coach-pay'
import { getCurrentTermRange } from '@/lib/utils/school-terms'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { CoachEditForm } from './coach-edit-form'
import { AssistantProgramsEditor } from './assistant-programs-editor'
import { Clock, GraduationCap, Calendar } from 'lucide-react'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function CoachDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ coachId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { coachId } = await params
  const { error, success } = await searchParams
  await requireAdmin()
  const supabase = await createClient()
  const { start: termStart, end: termEnd } = getCurrentTermRange(new Date())

  const { data: coach } = await supabase
    .from('coaches')
    .select('*')
    .eq('id', coachId)
    .single()

  if (!coach) notFound()

  const [
    { data: availability },
    { data: programAssignments },
    { data: earnings },
    { data: completedSessions },
    { data: scheduledSessions },
    { data: allProgramCoaches },
    { data: allActivePrograms },
  ] = await Promise.all([
    supabase.from('coach_availability').select('*').eq('coach_id', coachId).order('day_of_week').order('start_time'),
    supabase.from('program_coaches').select('program_id, role, programs:program_id(name, type, level, day_of_week, start_time, end_time, status)').eq('coach_id', coachId),
    supabase.from('coach_earnings').select('amount_cents, status, session_type, created_at').eq('coach_id', coachId),
    supabase.from('sessions')
      .select('id, program_id, coach_id, date, start_time, end_time, programs:program_id(name)')
      .eq('status', 'completed')
      .gte('date', termStart)
      .lte('date', termEnd)
      .order('date', { ascending: false }),
    supabase.from('sessions')
      .select('id, coach_id')
      .eq('status', 'scheduled')
      .eq('coach_id', coachId)
      .gte('date', termStart)
      .lte('date', termEnd),
    supabase.from('program_coaches').select('program_id, coach_id'),
    supabase.from('programs').select('id, name, type, day_of_week, start_time').eq('status', 'active').order('name'),
  ])

  const rateJson = (coach.hourly_rate ?? {}) as {
    group_rate_cents?: number
    private_rate_cents?: number
    client_private_rate_cents?: number | null
  }
  const groupRate = rateJson.group_rate_cents ?? 0
  const privateRate = rateJson.private_rate_cents ?? 0
  const clientPrivateRate = rateJson.client_private_rate_cents ?? null
  const parentRateMissing = clientPrivateRate == null && coach.delivers_privates !== false && !coach.is_owner

  // Coach attendance rows for this term — drives partial-pay derivation.
  type SessionCoachAttRow = { session_id: string; coach_id: string; status: string; actual_minutes: number | null; note: string | null }
  const completedSessionIds = (completedSessions ?? []).map(s => s.id)
  const { data: sessionCoachAttRowsRaw } = completedSessionIds.length > 0
    ? await supabase
        .from('session_coach_attendances')
        .select('session_id, coach_id, status, actual_minutes, note')
        .eq('coach_id', coachId)
        .in('session_id', completedSessionIds)
    : { data: [] }
  const coachAttByKey = attendanceMapForSessions((sessionCoachAttRowsRaw as unknown as SessionCoachAttRow[] | null) ?? [])

  // Calculate group pay this term — partial-attendance aware
  let groupPay = 0
  for (const s of completedSessions ?? []) {
    const isAssigned = (allProgramCoaches ?? []).some(pc => pc.program_id === s.program_id && pc.coach_id === coachId)
    const isDirect = s.coach_id === coachId
    if (!isAssigned && !isDirect) continue
    const durationMin = sessionDurationMin(s.start_time, s.end_time)
    const att = coachAttByKey.get(keyForSessionCoach(s.id, coachId))
    const { payCents } = deriveSessionCoachPay({ rateCents: groupRate || null, durationMin, attendance: att })
    groupPay += payCents
  }

  const completedCount = (completedSessions ?? []).filter(s =>
    (allProgramCoaches ?? []).some(pc => pc.program_id === s.program_id && pc.coach_id === coachId) || s.coach_id === coachId
  ).length
  const upcomingCount = (scheduledSessions ?? []).length

  const coachEarnings = earnings ?? []
  const owed = coachEarnings.filter(e => e.status === 'owed').reduce((s, e) => s + e.amount_cents, 0)
  const paid = coachEarnings.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount_cents, 0)

  // Partial / absent sessions this term (for the panel below)
  type PartialRow = {
    sessionId: string
    programId: string | null
    programName: string
    date: string
    durationMin: number
    status: 'partial' | 'absent'
    actualMinutes: number | null
    note: string | null
    fullPayCents: number
    payCents: number
  }
  const partialRows: PartialRow[] = []
  for (const s of completedSessions ?? []) {
    const att = coachAttByKey.get(keyForSessionCoach(s.id, coachId))
    if (!att || att.status === 'present') continue
    const durationMin = sessionDurationMin(s.start_time, s.end_time)
    const { payCents } = deriveSessionCoachPay({ rateCents: groupRate || null, durationMin, attendance: att })
    const fullPayCents = groupRate ? Math.round(groupRate * durationMin / 60) : 0
    const programInfo = (s as { programs?: { name: string } | null }).programs ?? null
    partialRows.push({
      sessionId: s.id,
      programId: s.program_id,
      programName: programInfo?.name ?? 'Session',
      date: (s as { date: string }).date,
      durationMin,
      status: att.status as 'partial' | 'absent',
      actualMinutes: att.actual_minutes,
      note: att.note ?? null,
      fullPayCents,
      payCents,
    })
  }
  const partialReductionCents = partialRows.reduce((sum, r) => sum + (r.fullPayCents - r.payCents), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={coach.name}
        description={coach.is_owner ? 'Owner' : (coach.status === 'active' ? 'Active coach' : 'Inactive')}
        breadcrumbs={[{ label: 'Coaches', href: '/admin/coaches' }]}
      />

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

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Details card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Details</h2>
              <CoachEditForm coach={{
                id: coach.id,
                name: coach.name,
                phone: coach.phone ?? '',
                email: coach.email ?? '',
                groupRateCents: groupRate,
                privateRateCents: privateRate,
                clientPrivateRateCents: clientPrivateRate,
                payPeriod: coach.pay_period ?? 'weekly',
                deliversPrivates: coach.delivers_privates ?? true,
                privateOptInRequired: coach.private_opt_in_required ?? false,
              }} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{coach.phone || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{coach.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pay period</span>
                <span className="capitalize">{(coach.pay_period ?? 'weekly').replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Group pay</span>
                <span>{groupRate > 0 ? `${formatCurrency(groupRate)}/hr` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Private pay</span>
                <span>{privateRate > 0 ? `${formatCurrency(privateRate)}/hr` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Parent rate (private)</span>
                <span className={parentRateMissing ? 'text-warning font-medium' : ''}>
                  {clientPrivateRate != null ? `${formatCurrency(clientPrivateRate)}/hr` : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivers privates</span>
                <span className={coach.delivers_privates === false ? 'text-muted-foreground' : 'text-success'}>
                  {coach.delivers_privates === false ? 'No (hidden from parents)' : 'Yes'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Privates opt-in only</span>
                <span className={coach.private_opt_in_required ? 'text-warning font-medium' : 'text-muted-foreground'}>
                  {coach.private_opt_in_required ? 'Yes (allowlist required)' : 'No (open access)'}
                </span>
              </div>
              {parentRateMissing && (
                <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning">
                  Parent rate is not set. Parents will not see a price for privates with this coach until you fill it in.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pay summary card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Pay This Term</h2>
              <Link href="/admin/coaches/earnings" className="text-xs text-primary hover:underline">Manage</Link>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-orange-600">{formatCurrency(owed)}</p>
                <p className="text-xs text-muted-foreground">Owed</p>
              </div>
              <div>
                <p className="text-lg font-bold text-success">{formatCurrency(paid)}</p>
                <p className="text-xs text-muted-foreground">Paid</p>
              </div>
              <div>
                <p className="text-lg font-bold">{formatCurrency(groupPay + owed + paid)}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
            {groupPay > 0 && (
              <p className="mt-2 text-xs text-muted-foreground text-center">Group pay: {formatCurrency(groupPay)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Availability */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock className="size-4" /> Availability
            </h2>
            <Link href={`/admin/coaches/availability?coach_id=${coachId}`} className="text-xs text-primary hover:underline">Edit</Link>
          </div>
          {(availability ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {(availability ?? []).map((w, i) => (
                <span key={i}>{DAY_NAMES[w.day_of_week]} {formatTime(w.start_time)} - {formatTime(w.end_time)}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No availability set</p>
          )}
        </CardContent>
      </Card>

      {/* Programs */}
      <AssistantProgramsEditor
        coachId={coachId}
        currentAssignments={(programAssignments ?? []).map(pa => {
          const prog = pa.programs as unknown as { name: string; type: string; level: string | null; day_of_week: number | null; start_time: string | null; end_time: string | null; status: string } | null
          return prog ? {
            programId: pa.program_id,
            name: prog.name,
            type: prog.type,
            day: prog.day_of_week,
            startTime: prog.start_time,
            endTime: prog.end_time,
            status: prog.status,
            role: pa.role,
          } : null
        }).filter((x): x is NonNullable<typeof x> => !!x)}
        availableToAssist={(allActivePrograms ?? [])
          .filter(p => !(programAssignments ?? []).some(pa => pa.program_id === p.id))
          .map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            day: p.day_of_week,
            startTime: p.start_time,
          }))}
      />

      {/* Session stats */}
      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
            <Calendar className="size-4" /> This Term
          </h2>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-2xl font-bold text-foreground">{completedCount}</span>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div>
              <span className="text-2xl font-bold text-foreground">{upcomingCount}</span>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Partial / absent sessions this term */}
      {partialRows.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="size-4 text-warning" /> Partial / absent sessions
              </h2>
              <span className="text-xs text-muted-foreground">
                Pay reduction: <span className="font-semibold text-warning">{formatCurrency(partialReductionCents)}</span>
              </span>
            </div>
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {partialRows.slice(0, 12).map((r) => (
                <Link
                  key={r.sessionId}
                  href={r.programId ? `/admin/programs/${r.programId}/sessions/${r.sessionId}` : '#'}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {r.programName} <span className="font-normal text-muted-foreground">· {new Date(r.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                    </p>
                    {r.note && <p className="text-xs text-muted-foreground italic truncate">{r.note}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs">
                      <span className={r.status === 'absent' ? 'text-danger font-medium' : 'text-warning font-medium'}>
                        {r.status === 'absent' ? 'Absent' : `${r.actualMinutes ?? r.durationMin} of ${r.durationMin} min`}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      <span className="line-through mr-1">{formatCurrency(r.fullPayCents)}</span>
                      <span className="text-foreground font-medium">{formatCurrency(r.payCents)}</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            {partialRows.length > 12 && (
              <p className="mt-2 text-xs text-muted-foreground">+ {partialRows.length - 12} more this term</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
