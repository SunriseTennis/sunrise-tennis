import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { calculateGroupCoachPay } from '@/lib/utils/billing'
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
      .select('id, program_id, coach_id, start_time, end_time')
      .eq('status', 'completed')
      .gte('date', termStart)
      .lte('date', termEnd),
    supabase.from('sessions')
      .select('id, coach_id')
      .eq('status', 'scheduled')
      .eq('coach_id', coachId)
      .gte('date', termStart)
      .lte('date', termEnd),
    supabase.from('program_coaches').select('program_id, coach_id'),
    supabase.from('programs').select('id, name, type, day_of_week, start_time').eq('status', 'active').order('name'),
  ])

  const groupRate = (coach.hourly_rate as { group_rate_cents?: number } | null)?.group_rate_cents ?? 0
  const privateRate = (coach.hourly_rate as { private_rate_cents?: number } | null)?.private_rate_cents ?? 0

  // Calculate group pay this term
  let groupPay = 0
  for (const s of completedSessions ?? []) {
    const isAssigned = (allProgramCoaches ?? []).some(pc => pc.program_id === s.program_id && pc.coach_id === coachId)
    const isDirect = s.coach_id === coachId
    if (!isAssigned && !isDirect) continue
    let durationMin = 60
    if (s.start_time && s.end_time) {
      const [sh, sm] = s.start_time.split(':').map(Number)
      const [eh, em] = s.end_time.split(':').map(Number)
      durationMin = (eh * 60 + em) - (sh * 60 + sm)
    }
    if (groupRate) groupPay += calculateGroupCoachPay(groupRate, durationMin)
  }

  const completedCount = (completedSessions ?? []).filter(s =>
    (allProgramCoaches ?? []).some(pc => pc.program_id === s.program_id && pc.coach_id === coachId) || s.coach_id === coachId
  ).length
  const upcomingCount = (scheduledSessions ?? []).length

  const coachEarnings = earnings ?? []
  const owed = coachEarnings.filter(e => e.status === 'owed').reduce((s, e) => s + e.amount_cents, 0)
  const paid = coachEarnings.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount_cents, 0)

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
                payPeriod: coach.pay_period ?? 'weekly',
                deliversPrivates: coach.delivers_privates ?? true,
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
                <span className="text-muted-foreground">Group rate</span>
                <span>{groupRate > 0 ? `${formatCurrency(groupRate)}/hr` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Private rate</span>
                <span>{privateRate > 0 ? `${formatCurrency(privateRate)}/hr` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivers privates</span>
                <span className={coach.delivers_privates === false ? 'text-muted-foreground' : 'text-success'}>
                  {coach.delivers_privates === false ? 'No (hidden from parents)' : 'Yes'}
                </span>
              </div>
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
    </div>
  )
}
