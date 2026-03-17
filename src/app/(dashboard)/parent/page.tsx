import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { BallLevelBadge } from '@/components/ball-level-badge'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Users, Calendar, GraduationCap } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function ParentDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
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
      <div>
        <PageHeader title="Parent Dashboard" />
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="No family account linked"
            description="This is how parents see their dashboard once invited."
          />
        </div>
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
    <div>
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Welcome, ${contact?.name?.split(' ')[0] ?? 'Parent'}`}
          description={`${family?.family_name} family account`}
        />
        <Card className={`border px-4 py-3 text-center ${
          balanceCents < 0 ? 'border-danger/20 bg-danger-light' :
          balanceCents > 0 ? 'border-success/20 bg-success-light' :
          ''
        }`}>
          <p className="text-xs font-medium text-muted-foreground">Account Balance</p>
          <p className={`text-2xl font-bold tabular-nums ${
            balanceCents < 0 ? 'text-danger' :
            balanceCents > 0 ? 'text-success' :
            'text-foreground'
          }`}>
            {formatCurrency(balanceCents)}
          </p>
        </Card>
      </div>

      {/* Players */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Your Players</h2>

        {players && players.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {players.map((player) => (
              <Link
                key={player.id}
                href={`/parent/players/${player.id}`}
                className="block rounded-lg border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-elevated"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {player.first_name} {player.last_name}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      {player.ball_color && <BallLevelBadge ballColor={player.ball_color} />}
                      {player.level && (
                        <span className="text-xs text-muted-foreground capitalize">{player.level}</span>
                      )}
                    </div>
                    {player.current_focus && (player.current_focus as string[]).length > 0 && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Focus: {(player.current_focus as string[]).join(', ')}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={player.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={Users}
              title="No players yet"
              description="No players linked to your account yet."
            />
          </div>
        )}
      </div>

      {/* Upcoming Sessions */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Upcoming Sessions</h2>

        {upcomingSessions && upcomingSessions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-card">
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
            />
          </div>
        )}
      </div>

      {/* Enrolled Programs */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Enrolled Programs</h2>

        {enrollments && enrollments.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {enrollments.map((enrollment) => {
              const program = enrollment.programs as unknown as {
                id: string; name: string; type: string; level: string;
                day_of_week: number | null; start_time: string | null; end_time: string | null; status: string
              } | null
              const player = enrollment.players as unknown as { id: string; first_name: string } | null
              if (!program) return null
              return (
                <Card key={enrollment.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-foreground">{program.name}</p>
                      <StatusBadge status={program.type} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {program.day_of_week != null && DAYS[program.day_of_week]}
                      {program.start_time && ` · ${formatTime(program.start_time)}`}
                      {program.end_time && ` - ${formatTime(program.end_time)}`}
                    </p>
                    {player && (
                      <p className="mt-1 text-xs text-muted-foreground">Player: {player.first_name}</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={GraduationCap}
              title="No enrolments"
              description="No program enrolments yet."
            />
          </div>
        )}
      </div>
    </div>
  )
}
