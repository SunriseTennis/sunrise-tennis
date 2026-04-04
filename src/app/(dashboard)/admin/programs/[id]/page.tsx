import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime, formatDate } from '@/lib/utils/dates'
import { calculateGroupCoachPay } from '@/lib/utils/billing'
import { ProgramEditForm } from './program-edit-form'
import { AdminEnrolForm } from './admin-enrol-form'
import { RosterTable } from './roster-table'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: program }, { data: roster }, { data: allFamilies }, { data: sessions }, { data: programCoaches }] = await Promise.all([
    supabase.from('programs').select('*').eq('id', id).single(),
    supabase.from('program_roster')
      .select('id, status, enrolled_at, players(id, first_name, last_name, ball_color, current_focus, families(display_id, family_name))')
      .eq('program_id', id)
      .order('enrolled_at'),
    supabase.from('families')
      .select('id, display_id, family_name, players(id, first_name, last_name)')
      .eq('status', 'active')
      .order('display_id'),
    supabase.from('sessions')
      .select('id, date, start_time, end_time, status, coach_id, coaches:coach_id(name)')
      .eq('program_id', id)
      .order('date'),
    supabase.from('program_coaches')
      .select('coach_id, role, coaches:coach_id(name, hourly_rate)')
      .eq('program_id', id),
  ])

  if (!program) notFound()

  // Fetch attendance records for all sessions of this program
  const sessionIds = (sessions ?? []).map(s => s.id)
  let allAttendances: { session_id: string; player_id: string; status: string }[] = []
  if (sessionIds.length > 0) {
    const { data } = await supabase
      .from('attendances')
      .select('session_id, player_id, status')
      .in('session_id', sessionIds)
    allAttendances = data ?? []
  }

  // Fetch charges for all sessions of this program
  let allCharges: { session_id: string | null; amount_cents: number; status: string }[] = []
  if (sessionIds.length > 0) {
    const { data } = await supabase
      .from('charges')
      .select('session_id, amount_cents, status')
      .in('session_id', sessionIds)
    allCharges = data ?? []
  }

  // ── Session status summary ──
  const sessionStatusCounts = {
    total: (sessions ?? []).length,
    completed: (sessions ?? []).filter(s => s.status === 'completed').length,
    scheduled: (sessions ?? []).filter(s => s.status === 'scheduled').length,
    cancelled: (sessions ?? []).filter(s => s.status === 'cancelled' || s.status === 'rained_out').length,
  }

  // ── Attendance per session (for the sessions table) ──
  const attendancePerSession: Record<string, number> = {}
  for (const a of allAttendances) {
    if (a.status === 'present') {
      attendancePerSession[a.session_id] = (attendancePerSession[a.session_id] ?? 0) + 1
    }
  }

  // ── Per-player attendance totals ──
  const rosterPlayerIds = new Set(
    (roster ?? []).map(r => (r.players as unknown as { id: string })?.id).filter(Boolean)
  )
  const playerAttendanceTotals: Record<string, { present: number; absent: number; noshow: number }> = {}
  for (const playerId of rosterPlayerIds) {
    playerAttendanceTotals[playerId] = { present: 0, absent: 0, noshow: 0 }
  }
  for (const a of allAttendances) {
    if (playerAttendanceTotals[a.player_id]) {
      if (a.status === 'present') playerAttendanceTotals[a.player_id].present++
      else if (a.status === 'absent') playerAttendanceTotals[a.player_id].absent++
      else if (a.status === 'noshow') playerAttendanceTotals[a.player_id].noshow++
    }
  }

  // ── Latest lesson notes per player (from most recent completed session) ──
  let latestPlayerNotes: Record<string, { focus: string | null; progress: string | null }> = {}
  const sortedCompleted = (sessions ?? [])
    .filter(s => s.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date))
  if (sortedCompleted.length > 0) {
    const { data: recentNotes } = await supabase
      .from('lesson_notes')
      .select('player_id, focus, progress')
      .eq('session_id', sortedCompleted[0].id)
      .not('player_id', 'is', null)
    for (const n of recentNotes ?? []) {
      if (n.player_id) {
        latestPlayerNotes[n.player_id] = { focus: n.focus, progress: n.progress }
      }
    }
  }

  // ── Financial tally ──
  const activeCharges = allCharges.filter(c => c.status !== 'voided')
  const totalRevenueCents = activeCharges.reduce((sum, c) => sum + c.amount_cents, 0)
  const gstCents = Math.round(totalRevenueCents / 11)
  const revenueExGst = totalRevenueCents - gstCents

  // Calculate total coach pay for all completed sessions
  let totalCoachPay = 0
  const completedSessions = (sessions ?? []).filter(s => s.status === 'completed')
  for (const s of completedSessions) {
    let durationMin = 60
    if (s.start_time && s.end_time) {
      const [sh, sm] = s.start_time.split(':').map(Number)
      const [eh, em] = s.end_time.split(':').map(Number)
      durationMin = (eh * 60 + em) - (sh * 60 + sm)
    }
    for (const pc of programCoaches ?? []) {
      const coach = pc.coaches as unknown as { name: string; hourly_rate: { group_rate_cents?: number } | null } | null
      const rate = coach?.hourly_rate?.group_rate_cents
      if (rate) {
        totalCoachPay += calculateGroupCoachPay(rate, durationMin)
      }
    }
  }

  const enrolledCount = roster?.length ?? 0

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={program.name}
        breadcrumbs={[{ label: 'Programs', href: '/admin/programs' }]}
        action={<StatusBadge status={program.status ?? 'active'} />}
      />

      <div className="mt-6 space-y-8">
        {/* Program details */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Program Details</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Type</dt>
                <dd className="text-sm capitalize text-foreground">{program.type}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Level</dt>
                <dd className="text-sm capitalize text-foreground">{program.level}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Day</dt>
                <dd className="text-sm text-foreground">{program.day_of_week != null ? DAYS[program.day_of_week] : '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Time</dt>
                <dd className="text-sm text-foreground">
                  {program.start_time ? formatTime(program.start_time) : '-'}
                  {program.end_time ? ` - ${formatTime(program.end_time)}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Capacity</dt>
                <dd className="text-sm text-foreground">{program.max_capacity ?? 'Unlimited'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Per Session</dt>
                <dd className="text-sm text-foreground">{program.per_session_cents ? formatCurrency(program.per_session_cents) : '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Term Fee</dt>
                <dd className="text-sm text-foreground">{program.term_fee_cents ? formatCurrency(program.term_fee_cents) : '-'}</dd>
              </div>
              {program.description && (
                <div className="sm:col-span-3">
                  <dt className="text-xs font-medium text-muted-foreground">Description</dt>
                  <dd className="text-sm text-foreground">{program.description}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Session status summary */}
        {sessionStatusCounts.total > 0 && (
          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-foreground">{sessionStatusCounts.total}</p>
                <p className="text-xs text-muted-foreground">Total Sessions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-success">{sessionStatusCounts.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-foreground">{sessionStatusCounts.scheduled}</p>
                <p className="text-xs text-muted-foreground">Scheduled</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-danger">{sessionStatusCounts.cancelled}</p>
                <p className="text-xs text-muted-foreground">Cancelled</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Sessions list */}
        {sessions && sessions.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Sessions ({sessions.length})</h2>
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Coach</TableHead>
                      <TableHead>Attended</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => {
                      const coach = s.coaches as unknown as { name: string } | null
                      const attended = attendancePerSession[s.id] ?? 0
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <Link
                              href={`/admin/programs/${id}/sessions/${s.id}`}
                              className="font-medium hover:text-primary transition-colors"
                            >
                              {formatDate(s.date)}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {s.start_time ? formatTime(s.start_time) : '-'}
                            {s.end_time ? ` - ${formatTime(s.end_time)}` : ''}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{coach?.name ?? '-'}</TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {s.status === 'completed' ? `${attended}/${enrolledCount}` : '-'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={s.status ?? 'scheduled'} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Per-player attendance */}
        {roster && roster.length > 0 && completedSessions.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Player Attendance</h2>
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Player</TableHead>
                      <TableHead className="text-center">Attended</TableHead>
                      <TableHead className="text-center">Absent</TableHead>
                      <TableHead className="text-center">No Show</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.map((r) => {
                      const player = r.players as unknown as { id: string; first_name: string; last_name: string } | null
                      if (!player) return null
                      const totals = playerAttendanceTotals[player.id] ?? { present: 0, absent: 0, noshow: 0 }
                      const totalMarked = totals.present + totals.absent + totals.noshow
                      const rate = totalMarked > 0 ? Math.round((totals.present / totalMarked) * 100) : 0
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{player.first_name} {player.last_name}</TableCell>
                          <TableCell className="text-center tabular-nums text-success">{totals.present}</TableCell>
                          <TableCell className="text-center tabular-nums text-danger">{totals.absent}</TableCell>
                          <TableCell className="text-center tabular-nums text-muted-foreground">{totals.noshow}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {totalMarked > 0 ? `${rate}%` : '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Financial tally */}
        {(totalRevenueCents > 0 || totalCoachPay > 0) && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Financial Summary</h2>
              <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Expected Revenue (inc GST)</span>
                  <span className="font-medium tabular-nums">{formatCurrency(totalRevenueCents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST (10%)</span>
                  <span className="tabular-nums text-muted-foreground">-{formatCurrency(gstCents)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="font-medium">Revenue ex-GST</span>
                  <span className="font-medium tabular-nums">{formatCurrency(revenueExGst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Coach Pay ({completedSessions.length} sessions)</span>
                  <span className="tabular-nums text-muted-foreground">-{formatCurrency(totalCoachPay)}</span>
                </div>
                <div className={`flex justify-between text-sm font-bold border-t border-border pt-2 ${revenueExGst - totalCoachPay >= 0 ? 'text-success' : 'text-danger'}`}>
                  <span>Net Profit</span>
                  <span className="tabular-nums">{formatCurrency(revenueExGst - totalCoachPay)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Roster */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">
              Roster ({enrolledCount}{program.max_capacity ? `/${program.max_capacity}` : ''})
            </h2>
            {roster && roster.length > 0 ? (
              <RosterTable
                roster={roster.map((r) => {
                  const player = r.players as unknown as { id: string; first_name: string; last_name: string; ball_color: string | null; current_focus: string[] | null; families: { display_id: string; family_name: string } | null } | null
                  return {
                    rosterId: r.id,
                    rosterStatus: r.status,
                    playerId: player?.id ?? '',
                    firstName: player?.first_name ?? '',
                    lastName: player?.last_name ?? '',
                    ballColor: player?.ball_color ?? null,
                    currentFocus: player?.current_focus ?? null,
                    familyDisplayId: player?.families?.display_id ?? null,
                    familyName: player?.families?.family_name ?? null,
                  }
                })}
                maxCapacity={program.max_capacity}
                attendanceTotals={playerAttendanceTotals}
                completedCount={sortedCompleted.length}
                latestNotes={latestPlayerNotes}
              />
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No players enrolled yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Admin enrol on behalf */}
        <AdminEnrolForm
          programId={id}
          families={(allFamilies ?? []).map(f => ({
            id: f.id,
            displayId: f.display_id,
            familyName: f.family_name,
            players: ((f.players as unknown as { id: string; first_name: string; last_name: string }[]) ?? []).map(p => ({
              id: p.id,
              firstName: p.first_name,
              lastName: p.last_name,
            })),
          }))}
        />

        {/* Edit */}
        <ProgramEditForm program={program} />
      </div>
    </div>
  )
}
