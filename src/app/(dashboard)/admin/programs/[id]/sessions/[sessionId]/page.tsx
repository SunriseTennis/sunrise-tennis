import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { calculateGroupCoachPay } from '@/lib/utils/billing'
import { AttendanceForm } from './attendance-form'
import { CancelSessionForm } from './cancel-session-form'
import { MarkCompleteForm } from './mark-complete-form'
import { WalkInForm } from './walk-in-form'
import { Suspense } from 'react'
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
import { AlertCircle } from 'lucide-react'

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sessionId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id: programId, sessionId } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('*, programs:program_id(id, name, level, type, per_session_cents, term_fee_cents), coaches:coach_id(id, name, hourly_rate), venues:venue_id(name)')
    .eq('id', sessionId)
    .single()

  if (!session) notFound()

  const program = session.programs as unknown as { id: string; name: string; level: string; type: string; per_session_cents: number | null; term_fee_cents: number | null } | null
  const sessionCoach = session.coaches as unknown as { id: string; name: string; hourly_rate: { group_rate_cents?: number; private_rate_cents?: number } | null } | null
  const venue = session.venues as unknown as { name: string } | null

  // Calculate session duration in minutes
  let durationMin = 60
  if (session.start_time && session.end_time) {
    const [sh, sm] = session.start_time.split(':').map(Number)
    const [eh, em] = session.end_time.split(':').map(Number)
    durationMin = (eh * 60 + em) - (sh * 60 + sm)
  }

  // Get roster for this program
  let rosterPlayers: { id: string; first_name: string; last_name: string }[] = []
  if (program?.id) {
    const { data: roster } = await supabase
      .from('program_roster')
      .select('players:player_id(id, first_name, last_name)')
      .eq('program_id', program.id)
      .eq('status', 'enrolled')

    rosterPlayers = roster?.map(r => r.players as unknown as { id: string; first_name: string; last_name: string }).filter(Boolean) ?? []
  }

  // Get existing attendance records (full join so we can render walk-ins not on roster)
  const { data: attendances } = await supabase
    .from('attendances')
    .select('player_id, status, notes, players:player_id(id, first_name, last_name)')
    .eq('session_id', sessionId)

  const attendanceMap = new Map(attendances?.map(a => [a.player_id, a.status]) ?? [])

  // Walk-in players = on attendance but not on the program roster
  const rosterIds = new Set(rosterPlayers.map(p => p.id))
  const walkInPlayers = (attendances ?? [])
    .map(a => a.players as unknown as { id: string; first_name: string; last_name: string } | null)
    .filter((p): p is { id: string; first_name: string; last_name: string } => !!p && !rosterIds.has(p.id))

  const attendanceFormPlayers = [...rosterPlayers, ...walkInPlayers]
  const presentInSession = new Set(attendanceFormPlayers.map(p => p.id))

  // Candidate players for the walk-in picker = all active players not already on attendance
  const { data: allActivePlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name, family_id, families:family_id(display_id, family_name)')
    .eq('status', 'active')
    .order('first_name')

  const walkInCandidates = (allActivePlayers ?? [])
    .filter(p => !presentInSession.has(p.id))
    .map(p => {
      const family = p.families as unknown as { display_id: string; family_name: string } | null
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        familyDisplayId: family?.display_id ?? '',
        familyName: family?.family_name ?? '',
      }
    })

  // ── Financial data ──
  // Charges for this session
  const { data: charges } = await supabase
    .from('charges')
    .select('id, amount_cents, status, type, player_id, players:player_id(first_name, last_name), family_id, families:family_id(display_id, family_name)')
    .eq('session_id', sessionId)

  // Bookings for this session (for payment_option)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, player_id, payment_option')
    .eq('session_id', sessionId)

  const bookingMap = new Map(bookings?.map(b => [b.player_id, b]) ?? [])

  // Program coaches
  const { data: programCoaches } = await supabase
    .from('program_coaches')
    .select('coach_id, role, coaches:coach_id(id, name, hourly_rate)')
    .eq('program_id', programId)

  // Lesson notes (session-level + per-player)
  const { data: lessonNotes } = await supabase
    .from('lesson_notes')
    .select('*, players:player_id(first_name, last_name), coaches:coach_id(name)')
    .eq('session_id', sessionId)
    .order('created_at')

  const sessionNote = (lessonNotes ?? []).find(n => n.player_id === null)
  const playerNotes = (lessonNotes ?? []).filter(n => n.player_id !== null)

  // Calculate financials
  const activeCharges = (charges ?? []).filter(c => c.status !== 'voided')
  const totalRevenueCents = activeCharges.reduce((sum, c) => sum + c.amount_cents, 0)
  const gstCents = Math.round(totalRevenueCents / 11)
  const revenueExGst = totalRevenueCents - gstCents

  // Calculate coach pay
  type CoachPayRow = { name: string; role: string; rateCents: number | null; payCents: number }
  const coachPayRows: CoachPayRow[] = []

  for (const pc of programCoaches ?? []) {
    const coach = pc.coaches as unknown as { id: string; name: string; hourly_rate: { group_rate_cents?: number } | null } | null
    if (!coach) continue
    const rate = coach.hourly_rate?.group_rate_cents ?? null
    const pay = rate ? calculateGroupCoachPay(rate, durationMin) : 0
    coachPayRows.push({
      name: coach.name,
      role: pc.role,
      rateCents: rate,
      payCents: pay,
    })
  }

  // If session has a direct coach not in program_coaches, add them
  if (sessionCoach && !coachPayRows.some(r => r.name === sessionCoach.name)) {
    const rate = sessionCoach.hourly_rate?.group_rate_cents ?? null
    const pay = rate ? calculateGroupCoachPay(rate, durationMin) : 0
    coachPayRows.push({
      name: sessionCoach.name,
      role: 'primary',
      rateCents: rate,
      payCents: pay,
    })
  }

  const totalCoachPay = coachPayRows.reduce((sum, r) => sum + r.payCents, 0)
  const netProfit = revenueExGst - totalCoachPay

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`${program?.name ?? session.session_type} - ${formatDate(session.date)}`}
        breadcrumbs={[
          { label: 'Programs', href: '/admin/programs' },
          ...(program ? [{ label: program.name, href: `/admin/programs/${program.id}` }] : []),
        ]}
        action={<StatusBadge status={session.status ?? 'scheduled'} />}
      />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-6 space-y-8">
        {/* Session info */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Session Details</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Date</dt>
                <dd className="text-sm text-foreground">{formatDate(session.date)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Time</dt>
                <dd className="text-sm text-foreground">
                  {session.start_time ? formatTime(session.start_time) : '-'}
                  {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                  <span className="ml-1 text-xs text-muted-foreground">({durationMin}min)</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Coach</dt>
                <dd className="text-sm text-foreground">{sessionCoach?.name ?? 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Venue</dt>
                <dd className="text-sm text-foreground">{venue?.name ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Type</dt>
                <dd className="text-sm capitalize text-foreground">{session.session_type}</dd>
              </div>
              {program && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Program</dt>
                  <dd className="text-sm text-foreground">
                    <Link href={`/admin/programs/${program.id}`} className="text-primary hover:text-primary/80 transition-colors">
                      {program.name}
                    </Link>
                  </dd>
                </div>
              )}
              {session.cancellation_reason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Cancellation Reason</dt>
                  <dd className="text-sm text-foreground">{session.cancellation_reason}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Financial Breakdown */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Financial Breakdown</h2>

            {activeCharges.length > 0 ? (
              <>
                {/* Player charges table */}
                <div className="mt-4 overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Player</TableHead>
                        <TableHead>Family</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeCharges.map((charge) => {
                        const player = charge.players as unknown as { first_name: string; last_name: string } | null
                        const family = charge.families as unknown as { display_id: string; family_name: string } | null
                        const hasEarlyBird = charge.type === 'early_bird' || (charge.type === 'term_enrollment' && program?.per_session_cents && charge.amount_cents < program.per_session_cents)
                        return (
                          <TableRow key={charge.id}>
                            <TableCell className="text-sm">
                              {player ? `${player.first_name} ${player.last_name}` : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {family ? `${family.display_id} (${family.family_name})` : '-'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-sm">
                              {formatCurrency(charge.amount_cents)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {hasEarlyBird ? (
                                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Early bird</span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={charge.status} />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Revenue summary */}
                <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Revenue (inc GST)</span>
                    <span className="font-medium tabular-nums">{formatCurrency(totalRevenueCents)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST (10%)</span>
                    <span className="tabular-nums text-muted-foreground">-{formatCurrency(gstCents)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium border-t border-border pt-2">
                    <span>Revenue ex-GST</span>
                    <span className="tabular-nums">{formatCurrency(revenueExGst)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No charges recorded for this session yet.</p>
            )}

            {/* Coach pay */}
            {coachPayRows.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">Coach Pay</h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Coach</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Hourly Rate</TableHead>
                        <TableHead className="text-right">Session Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coachPayRows.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">{row.name}</TableCell>
                          <TableCell className="text-sm capitalize text-muted-foreground">{row.role}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                            {row.rateCents ? `${formatCurrency(row.rateCents)}/hr` : 'Rate not set'}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">
                            {row.rateCents ? formatCurrency(row.payCents) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Profit summary */}
                <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Revenue ex-GST</span>
                    <span className="tabular-nums">{formatCurrency(revenueExGst)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Coach Pay</span>
                    <span className="tabular-nums text-muted-foreground">-{formatCurrency(totalCoachPay)}</span>
                  </div>
                  <div className={`flex justify-between text-sm font-bold border-t border-border pt-2 ${netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                    <span>Net Profit</span>
                    <span className="tabular-nums">{formatCurrency(netProfit)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coach Session Notes (visible to admin) */}
        {sessionNote && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Coach Session Notes</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Written by {(sessionNote.coaches as unknown as { name: string } | null)?.name ?? 'coach'}
              </p>
              <p className="mt-3 text-sm text-foreground whitespace-pre-wrap">{sessionNote.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Per-Player Lesson Notes */}
        {playerNotes.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Player Lesson Notes</h2>
              <div className="mt-3 space-y-3">
                {playerNotes.map((note) => {
                  const player = note.players as unknown as { first_name: string; last_name: string } | null
                  return (
                    <div key={note.id} className="rounded-lg border border-border p-3">
                      <p className="font-medium text-foreground text-sm">{player?.first_name} {player?.last_name}</p>
                      {note.focus && <p className="mt-1 text-xs text-muted-foreground"><strong>Focus:</strong> {note.focus}</p>}
                      {note.progress && <p className="mt-0.5 text-xs text-muted-foreground"><strong>Progress:</strong> {note.progress}</p>}
                      {note.notes && <p className="mt-0.5 text-xs text-muted-foreground">{note.notes}</p>}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attendance (roster + walk-ins) */}
        {session.status !== 'cancelled' && attendanceFormPlayers.length > 0 && (
          <Suspense>
            <AttendanceForm
              sessionId={sessionId}
              players={attendanceFormPlayers}
              attendanceMap={Object.fromEntries(attendanceMap)}
            />
          </Suspense>
        )}

        {session.status !== 'cancelled' && attendanceFormPlayers.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
              <p className="mt-2 text-sm text-muted-foreground">No players on the roster for this session. Use the walk-in form below to add one.</p>
            </CardContent>
          </Card>
        )}

        {/* Walk-in form */}
        {session.status !== 'cancelled' && (
          <WalkInForm
            sessionId={sessionId}
            programId={programId}
            candidatePlayers={walkInCandidates}
          />
        )}

        {/* Mark complete / Cancel session */}
        {session.status === 'scheduled' && (
          <div className="space-y-3">
            <Suspense>
              <MarkCompleteForm sessionId={sessionId} />
            </Suspense>
            <Suspense>
              <CancelSessionForm sessionId={sessionId} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  )
}
