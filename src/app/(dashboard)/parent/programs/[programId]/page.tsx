import { redirect, notFound } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateFriendly, formatTime } from '@/lib/utils/dates'
import { EnrolForm } from './enrol-form'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, CheckCircle } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_PREFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function stripDayPrefix(name: string, type: string): string {
  const lower = name.toLowerCase()
  for (const prefix of DAY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      const stripped = name.slice(prefix.length + 1)
      const suffix = type === 'group' ? ' Group' : type === 'squad' ? ' Squad' : ''
      return stripped + suffix
    }
  }
  return name
}

export default async function ParentProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { programId } = await params
  const { error, success } = await searchParams
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
  if (!familyId) redirect('/parent')

  // Fetch program, family players, and roster in parallel
  const [
    { data: program },
    { data: players },
    { data: roster },
    { data: upcomingSessions },
  ] = await Promise.all([
    supabase.from('programs').select('*, venues:venue_id(name, address)').eq('id', programId).single(),
    supabase.from('players').select('id, first_name, last_name, ball_color, level, status').eq('family_id', familyId).eq('status', 'active').order('first_name'),
    supabase.from('program_roster').select('id, player_id, status').eq('program_id', programId),
    supabase.from('sessions').select('id, date, start_time, end_time, status')
      .eq('program_id', programId)
      .gte('date', new Date().toISOString().split('T')[0])
      .eq('status', 'scheduled')
      .order('date'),
  ])

  if (!program) notFound()

  const venue = program.venues as unknown as { name: string; address: string | null } | null
  const enrolledPlayerIds = new Set(
    roster?.filter(r => r.status === 'enrolled').map(r => r.player_id) ?? []
  )
  const totalEnrolled = roster?.filter(r => r.status === 'enrolled').length ?? 0
  const spotsLeft = program.max_capacity ? program.max_capacity - totalEnrolled : null

  // Players eligible to enrol (not already enrolled)
  const eligiblePlayers = players?.filter(p => !enrolledPlayerIds.has(p.id)) ?? []
  // Players already enrolled
  const enrolledPlayers = players?.filter(p => enrolledPlayerIds.has(p.id)) ?? []

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={stripDayPrefix(program.name, program.type)}
        breadcrumbs={[{ label: 'Programs', href: '/parent/programs' }]}
      />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#C53030] px-4 py-3.5 text-sm font-medium text-white shadow-sm">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#2D8A4E] px-4 py-3.5 text-sm font-medium text-white shadow-sm">
          <CheckCircle className="size-4 shrink-0" />
          {success}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {/* Program Details */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="capitalize">
                {program.type}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {program.level}
              </Badge>
            </div>

            {program.description && (
              <p className="mt-3 text-sm text-muted-foreground">{program.description}</p>
            )}

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Schedule</dt>
                <dd className="text-sm text-foreground">
                  {program.day_of_week != null ? DAYS[program.day_of_week] : '-'}
                  {program.start_time && ` · ${formatTime(program.start_time)}`}
                  {program.end_time && ` - ${formatTime(program.end_time)}`}
                </dd>
              </div>
              {venue && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Venue</dt>
                  <dd className="text-sm text-foreground">{venue.name}</dd>
                </div>
              )}
              {program.per_session_cents && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Per Session</dt>
                  <dd className="text-sm text-foreground">{formatCurrency(program.per_session_cents)}</dd>
                </div>
              )}
              {program.per_session_cents && upcomingSessions && upcomingSessions.length > 0 && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Term Fee</dt>
                  <dd className="text-sm text-foreground">
                    {formatCurrency(program.per_session_cents * upcomingSessions.length)}
                    <span className="ml-1.5 text-xs text-muted-foreground">({upcomingSessions.length} sessions)</span>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Enrolled Players */}
        {enrolledPlayers.length > 0 && (
          <div className="rounded-lg border border-success/20 bg-success-light p-6">
            <h2 className="text-lg font-semibold text-success">Already Enrolled</h2>
            <div className="mt-3 space-y-2">
              {enrolledPlayers.map((player) => (
                <div key={player.id} className="flex items-center gap-2 text-sm text-success">
                  <span className="inline-block h-2 w-2 rounded-full bg-success"></span>
                  {player.first_name} {player.last_name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enrol Form */}
        {eligiblePlayers.length > 0 && (spotsLeft === null || spotsLeft > 0) && (
          <EnrolForm
            programId={programId}
            familyId={familyId}
            players={eligiblePlayers.map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, level: p.ball_color }))}
            programLevel={program.level}
            termFeeCents={program.term_fee_cents}
            perSessionCents={program.per_session_cents}
            earlyPayDiscountPct={program.early_pay_discount_pct}
            earlyBirdDeadline={program.early_bird_deadline}
            remainingSessions={upcomingSessions?.length ?? null}
          />
        )}

        {eligiblePlayers.length === 0 && enrolledPlayers.length > 0 && (
          <p className="text-sm text-muted-foreground">All your players are already enrolled in this program.</p>
        )}

        {spotsLeft === 0 && eligiblePlayers.length > 0 && (
          <div className="rounded-lg border border-warning/20 bg-warning-light px-4 py-3 text-sm text-warning">
            This program is currently full. Contact your coach if you&apos;d like to be added to a waitlist.
          </div>
        )}

        {/* Upcoming Sessions */}
        {upcomingSessions && upcomingSessions.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Upcoming Sessions</h2>
              <div className="mt-3 space-y-2">
                {upcomingSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2 text-sm">
                    <span className="text-foreground">{formatDateFriendly(session.date)}</span>
                    <span className="text-muted-foreground">
                      {session.start_time ? formatTime(session.start_time) : '-'}
                      {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
