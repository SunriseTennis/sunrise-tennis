import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { StatusBadge } from '@/components/status-badge'
import { BallLevelBadge } from '@/components/ball-level-badge'
import { EmptyState } from '@/components/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Users, Calendar, GraduationCap, ChevronRight } from 'lucide-react'
import { EnrolledCalendar } from './enrolled-calendar'

function formatLevel(ballColor: string | null, level: string | null): string {
  if (!ballColor && !level) return '-'
  const bc = ballColor?.toLowerCase()
  if (bc && ['red', 'orange', 'green', 'yellow', 'blue'].includes(bc)) {
    return `${bc.charAt(0).toUpperCase() + bc.slice(1)} Ball`
  }
  return level ?? '-'
}

export default async function ParentDashboard() {
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
          icon={Users}
          title="No family account linked"
          description="This is how parents see their dashboard once invited."
        />
      </div>
    )
  }

  const [
    { data: family },
    { data: players },
    { data: balance },
    { data: enrollments },
  ] = await Promise.all([
    supabase.from('families').select('*').eq('id', familyId).single(),
    supabase.from('players').select('*').eq('family_id', familyId).order('first_name'),
    supabase.from('family_balance').select('balance_cents').eq('family_id', familyId).single(),
    supabase
      .from('program_roster')
      .select('id, status, players!inner(id, first_name), programs:program_id(id, name, type, level, day_of_week, start_time, end_time, status)')
      .eq('status', 'enrolled')
      .in('player_id', (await supabase.from('players').select('id').eq('family_id', familyId)).data?.map(p => p.id) ?? []),
  ])

  const contact = family?.primary_contact as { name?: string; phone?: string; email?: string } | null
  const balanceCents = balance?.balance_cents ?? 0
  const firstName = contact?.name?.split(' ')[0] ?? 'Parent'

  const programIds = enrollments?.map(e => {
    const prog = e.programs as unknown as { id: string } | null
    return prog?.id
  }).filter(Boolean) as string[] ?? []

  const today = new Date().toISOString().split('T')[0]
  const { data: upcomingSessions } = programIds.length > 0
    ? await supabase
        .from('sessions')
        .select('id, date, start_time, end_time, status, programs:program_id(name, level, type)')
        .in('program_id', programIds)
        .gte('date', today)
        .eq('status', 'scheduled')
        .order('date')
        .order('start_time')
        .limit(10)
    : { data: null }

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Welcome back</p>
            <h1 className="text-2xl font-bold">{firstName}</h1>
            <p className="mt-0.5 text-sm text-white/70">{family?.family_name} family</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-white/70">Balance</p>
            <p className={`text-2xl font-bold tabular-nums ${
              balanceCents < 0 ? 'text-red-200' :
              balanceCents > 0 ? 'text-emerald-200' :
              'text-white'
            }`}>
              {formatCurrency(balanceCents)}
            </p>
            {balanceCents < 0 && (
              <Link href="/parent/payments" className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30">
                Pay now <ChevronRight className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Players ── */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Your Players</h2>
          <span className="text-xs text-muted-foreground">{players?.length ?? 0} player{(players?.length ?? 0) !== 1 ? 's' : ''}</span>
        </div>

        {players && players.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {players.map((player, i) => {
              const initial = player.first_name?.[0]?.toUpperCase() ?? '?'
              const levelText = formatLevel(player.ball_color, player.level)

              return (
                <Link
                  key={player.id}
                  href={`/parent/players/${player.id}`}
                  className="group relative block overflow-hidden rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] hover:border-primary/30"
                  style={{ animationDelay: `${(i + 1) * 80}ms` }}
                >
                  {/* Primary accent bar */}
                  <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-secondary" />

                  <div className="flex items-center gap-3 pl-2">
                    {/* Avatar */}
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-white font-bold text-sm shadow-sm">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-foreground truncate">
                          {player.first_name} {player.last_name}
                        </p>
                        <StatusBadge status={player.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{levelText}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={Users}
              title="No players yet"
              description="No players linked to your account yet."
              compact
            />
          </div>
        )}
      </section>

      {/* ── Weekly Schedule (before Upcoming Sessions) ── */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="text-lg font-semibold text-foreground">Weekly Schedule</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your enrolled sessions at a glance.</p>

        {enrollments && enrollments.length > 0 ? (
          <div className="mt-3">
            <EnrolledCalendar
              enrollments={enrollments.map((enrollment) => {
                const program = enrollment.programs as unknown as {
                  id: string; name: string; type: string; level: string;
                  day_of_week: number | null; start_time: string | null; end_time: string | null; status: string
                } | null
                const player = enrollment.players as unknown as { id: string; first_name: string } | null
                return {
                  id: enrollment.id,
                  playerName: player?.first_name ?? '',
                  programId: program?.id ?? '',
                  programName: program?.name ?? '',
                  programType: program?.type ?? '',
                  programLevel: program?.level ?? null,
                  dayOfWeek: program?.day_of_week ?? null,
                  startTime: program?.start_time ?? null,
                  endTime: program?.end_time ?? null,
                }
              })}
            />
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={GraduationCap}
              title="No enrolments"
              description="No program enrolments yet."
              compact
            />
          </div>
        )}
      </section>

      {/* ── Upcoming Sessions ── */}
      <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Upcoming Sessions</h2>
          {upcomingSessions && upcomingSessions.length > 0 && (
            <span className="text-xs text-muted-foreground">Next {upcomingSessions.length}</span>
          )}
        </div>

        {upcomingSessions && upcomingSessions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Date</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingSessions.map((session) => {
                  const program = session.programs as unknown as { name: string; level: string; type: string } | null
                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{formatDate(session.date)}</TableCell>
                      <TableCell>{program?.name ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {session.start_time ? formatTime(session.start_time) : '-'}
                        {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                      </TableCell>
                      <TableCell>
                        {program?.level && <BallLevelBadge ballColor={program.level} />}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={Calendar}
              title="No upcoming sessions"
              description="No sessions scheduled yet."
              compact
            />
          </div>
        )}
      </section>
    </div>
  )
}
