import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import {
  attendanceMapForSession,
  deriveSessionCoachPay,
  sessionDurationMin,
} from '@/lib/utils/coach-pay'
import { isSessionFuture } from '@/lib/utils/sessions-filter'
import { AttendanceForm } from './attendance-form'
import { AddPlayersCard } from './add-players-card'
import { CoachAttendanceCard } from './coach-attendance-card'
import { SessionActions } from './session-actions'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { DisclosureCard } from '@/components/inline-edit/disclosure-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertCircle, CheckCircle2, Calendar as CalendarIcon, Clock, MapPin, GraduationCap, ListChecks, Receipt, FileText,
} from 'lucide-react'
import { PlayerPill, FamilyPill, CoachPill } from '@/components/admin/entity-pills'

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sessionId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id: programId, sessionId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('*, programs:program_id(id, name, level, type, per_session_cents, term_fee_cents), coaches:coach_id(id, name, hourly_rate, is_owner), venues:venue_id(name)')
    .eq('id', sessionId)
    .single()

  if (!session) notFound()

  const program = session.programs as unknown as { id: string; name: string; level: string; type: string; per_session_cents: number | null; term_fee_cents: number | null } | null
  const sessionCoach = session.coaches as unknown as { id: string; name: string; hourly_rate: { group_rate_cents?: number; private_rate_cents?: number } | null; is_owner: boolean } | null
  const venue = session.venues as unknown as { name: string } | null

  const durationMin = sessionDurationMin(session.start_time, session.end_time)

  // ── Roster + attendances ───────────────────────────────────────────────
  let rosterPlayers: { id: string; first_name: string; last_name: string; family_id: string }[] = []
  if (program?.id) {
    const { data: roster } = await supabase
      .from('program_roster')
      .select('players:player_id(id, first_name, last_name, family_id)')
      .eq('program_id', program.id)
      .eq('status', 'enrolled')

    rosterPlayers = roster?.map(r => r.players as unknown as { id: string; first_name: string; last_name: string; family_id: string }).filter(Boolean) ?? []
  }

  const { data: attendances } = await supabase
    .from('attendances')
    .select('player_id, status, players:player_id(id, first_name, last_name, family_id)')
    .eq('session_id', sessionId)

  const attendanceMap = new Map(attendances?.map(a => [a.player_id, a.status]) ?? [])
  const rosterIds = new Set(rosterPlayers.map(p => p.id))

  const walkInPlayers = (attendances ?? [])
    .map(a => a.players as unknown as { id: string; first_name: string; last_name: string; family_id: string } | null)
    .filter((p): p is { id: string; first_name: string; last_name: string; family_id: string } => !!p && !rosterIds.has(p.id))

  const attendanceFormPlayers = [
    ...rosterPlayers.map(p => ({ ...p, isWalkIn: false })),
    ...walkInPlayers.map(p => ({ ...p, isWalkIn: true })),
  ]
  const presentInSession = new Set(attendanceFormPlayers.map(p => p.id))
  const enrolledInProgram = new Set(rosterIds)

  // ── Active families + their players for the picker ─────────────────────
  const { data: familyRows } = await supabase
    .from('families')
    .select(`
      id, display_id, family_name, primary_contact,
      players(id, first_name, last_name, classifications, status)
    `)
    .eq('status', 'active')
    .order('display_id')

  type RawFam = {
    id: string
    display_id: string
    family_name: string
    primary_contact: { name?: string } | null
    players: { id: string; first_name: string; last_name: string; classifications: string[] | null; status: string }[]
  }

  const families = (familyRows ?? []).map((row) => {
    const f = row as unknown as RawFam
    return {
      id: f.id,
      displayId: f.display_id,
      familyName: f.family_name,
      parentName: f.primary_contact?.name ?? null,
      players: (f.players ?? [])
        .filter(p => p.status === 'active')
        .map(p => ({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          classifications: p.classifications ?? [],
        })),
    }
  })

  // ── Future-session count for the term-enrol preview ────────────────────
  let futureSessionCount = 0
  if (program?.id) {
    const todayStr = new Date().toISOString().split('T')[0]
    const { data: futureRaw } = await supabase
      .from('sessions')
      .select('id, date, start_time, status')
      .eq('program_id', program.id)
      .eq('status', 'scheduled')
      .gte('date', todayStr)
      .order('date')
    const future = (futureRaw ?? []).filter(s => isSessionFuture(s as { date: string; start_time: string | null }))
    futureSessionCount = future.length
  }

  // ── Charges + bookings + program coaches + lesson notes + coach attendance ─
  const [
    { data: charges },
    { data: programCoaches },
    { data: lessonNotes },
    { data: coachAtt },
    { data: allActiveCoaches },
  ] = await Promise.all([
    supabase
      .from('charges')
      .select('id, amount_cents, status, type, player_id, players:player_id(first_name, last_name), family_id, families:family_id(id, display_id, family_name)')
      .eq('session_id', sessionId),
    supabase
      .from('program_coaches')
      .select('coach_id, role, coaches:coach_id(id, name, hourly_rate, is_owner)')
      .eq('program_id', programId),
    supabase
      .from('lesson_notes')
      .select('*, players:player_id(id, first_name, last_name, family_id), coaches:coach_id(name)')
      .eq('session_id', sessionId)
      .order('created_at'),
    supabase
      .from('session_coach_attendances')
      .select('coach_id, status, actual_minutes, note')
      .eq('session_id', sessionId),
    supabase
      .from('coaches')
      .select('id, name, status, hourly_rate, is_owner')
      .eq('status', 'active')
      .order('name'),
  ])

  type SessionCoachAttRow = { coach_id: string; status: string; actual_minutes: number | null; note: string | null }
  const coachAttMap = attendanceMapForSession(
    ((coachAtt as unknown as SessionCoachAttRow[] | null) ?? []).map(r => ({
      coach_id: r.coach_id,
      status: r.status,
      actual_minutes: r.actual_minutes,
      note: r.note,
    })),
  )

  // ── Build coach pay rows (with attendance-aware derivation) ────────────
  type CoachPayRow = {
    id: string
    name: string
    role: string
    rateCents: number | null
    isOwner: boolean
    fullPayCents: number
    payCents: number
    effectiveMinutes: number
    status: 'present' | 'absent' | 'partial'
    note: string | null
  }
  const coachPayRows: CoachPayRow[] = []

  function pushCoachPayRow(coach: { id: string; name: string; hourly_rate: { group_rate_cents?: number } | null; is_owner: boolean }, role: string) {
    const rate = coach.hourly_rate?.group_rate_cents ?? null
    const att = coachAttMap.get(coach.id)
    const derived = deriveSessionCoachPay({ rateCents: rate, durationMin, attendance: att })
    const fullPay = rate ? Math.round(rate * durationMin / 60) : 0
    coachPayRows.push({
      id: coach.id,
      name: coach.name,
      role,
      rateCents: rate,
      isOwner: !!coach.is_owner,
      fullPayCents: fullPay,
      payCents: derived.payCents,
      effectiveMinutes: derived.effectiveMinutes,
      status: derived.status,
      note: att?.note ?? null,
    })
  }

  for (const pc of programCoaches ?? []) {
    const coach = pc.coaches as unknown as { id: string; name: string; hourly_rate: { group_rate_cents?: number } | null; is_owner: boolean } | null
    if (!coach) continue
    pushCoachPayRow(coach, pc.role)
  }

  if (sessionCoach && !coachPayRows.some(r => r.id === sessionCoach.id)) {
    pushCoachPayRow(sessionCoach, 'primary')
  }

  // Subs = coaches in coachAttMap that aren't program coaches and aren't the session coach.
  const knownCoachIds = new Set(coachPayRows.map(r => r.id))
  for (const [coachId] of coachAttMap) {
    if (knownCoachIds.has(coachId)) continue
    const subCoach = (allActiveCoaches ?? []).find(c => c.id === coachId)
    if (!subCoach) continue
    pushCoachPayRow(
      { id: subCoach.id, name: subCoach.name, hourly_rate: subCoach.hourly_rate as never, is_owner: subCoach.is_owner ?? false },
      'sub',
    )
    knownCoachIds.add(coachId)
  }

  // ── Initial coach attendance card data ─────────────────────────────────
  const initialCoaches = coachPayRows.map(r => ({
    id: r.id,
    name: r.name,
    role: r.role,
    isSub: r.role === 'sub',
    rateCents: r.rateCents,
    isOwner: r.isOwner,
  }))

  const initialAttendance: Record<string, { status: 'present' | 'absent' | 'partial'; actual_minutes: number | null; note: string | null }> = {}
  for (const [cid, att] of coachAttMap) {
    initialAttendance[cid] = {
      status: att.status,
      actual_minutes: att.actual_minutes,
      note: att.note ?? null,
    }
  }

  const candidateSubCoaches = (allActiveCoaches ?? [])
    .filter(c => !knownCoachIds.has(c.id))
    .map(c => ({ id: c.id, name: c.name }))

  // ── Lesson notes ───────────────────────────────────────────────────────
  const sessionNote = (lessonNotes ?? []).find(n => n.player_id === null)
  const playerNotes = (lessonNotes ?? []).filter(n => n.player_id !== null)

  // ── Financials ─────────────────────────────────────────────────────────
  const activeCharges = (charges ?? []).filter(c => c.status !== 'voided')
  const totalRevenueCents = activeCharges.reduce((sum, c) => sum + c.amount_cents, 0)
  const gstCents = Math.round(totalRevenueCents / 11)
  const revenueExGst = totalRevenueCents - gstCents
  const totalCoachPay = coachPayRows.reduce((sum, r) => sum + (r.isOwner ? 0 : r.payCents), 0)
  const fullCoachPay = coachPayRows.reduce((sum, r) => sum + (r.isOwner ? 0 : r.fullPayCents), 0)
  const netProfit = revenueExGst - totalCoachPay

  const isCancelled = session.status === 'cancelled'

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title={`${program?.name ?? session.session_type} — ${formatDate(session.date)}`}
        breadcrumbs={[
          { label: 'Programs', href: '/admin/programs' },
          ...(program ? [{ label: program.name, href: `/admin/programs/${program.id}` }] : []),
        ]}
        action={<StatusBadge status={session.status ?? 'scheduled'} />}
      />

      {(error || success) && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            error
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-success/30 bg-success/10 text-success'
          }`}
          role="status"
        >
          {error ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
          <span>{decodeURIComponent(error ?? success ?? '')}</span>
        </div>
      )}

      {/* 1. Session actions (top — most-used) */}
      {!isCancelled && session.status !== 'completed' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Session actions</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Mark complete locks the session. Cancel adjusts charges + notifies enrolled families.
                </p>
              </div>
              <SessionActions sessionId={sessionId} status={session.status ?? 'scheduled'} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. Session details */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-foreground">Session details</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <DetailRow icon={<CalendarIcon className="size-3.5" />} label="Date">
              {formatDate(session.date)}
            </DetailRow>
            <DetailRow icon={<Clock className="size-3.5" />} label="Time">
              {session.start_time ? formatTime(session.start_time) : '-'}
              {session.end_time ? ` — ${formatTime(session.end_time)}` : ''}
              <span className="ml-1 text-xs text-muted-foreground">({durationMin}min)</span>
            </DetailRow>
            <DetailRow icon={<GraduationCap className="size-3.5" />} label="Coach">
              {sessionCoach
                ? <CoachPill coachId={sessionCoach.id} name={sessionCoach.name} />
                : <span className="text-muted-foreground">Unassigned</span>}
            </DetailRow>
            <DetailRow icon={<MapPin className="size-3.5" />} label="Venue">
              {venue?.name ?? '-'}
            </DetailRow>
            <DetailRow icon={<ListChecks className="size-3.5" />} label="Type">
              <span className="capitalize">{session.session_type}</span>
            </DetailRow>
            {program && (
              <DetailRow icon={<FileText className="size-3.5" />} label="Program">
                <Link href={`/admin/programs/${program.id}`} className="text-primary hover:underline">
                  {program.name}
                </Link>
              </DetailRow>
            )}
            {session.cancellation_reason && (
              <div className="sm:col-span-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2">
                <dt className="text-xs font-medium text-danger">Cancellation reason</dt>
                <dd className="mt-0.5 text-sm text-foreground">{session.cancellation_reason}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* 3. Player attendance */}
      {!isCancelled && attendanceFormPlayers.length > 0 && (
        <AttendanceForm
          sessionId={sessionId}
          programId={programId}
          players={attendanceFormPlayers}
          attendanceMap={Object.fromEntries(attendanceMap) as Record<string, 'present' | 'absent' | 'noshow'>}
        />
      )}
      {!isCancelled && attendanceFormPlayers.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No players yet. Add a walk-in or term-enrol below.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4. Add players (walk-in OR term enrol) */}
      {!isCancelled && (
        <AddPlayersCard
          sessionId={sessionId}
          programId={programId}
          programLevel={program?.level ?? null}
          families={families}
          walkInExcludedIds={Array.from(presentInSession)}
          termExcludedIds={Array.from(enrolledInProgram)}
          futureSessionCount={futureSessionCount}
        />
      )}

      {/* 5. Coach attendance */}
      {!isCancelled && (
        <CoachAttendanceCard
          sessionId={sessionId}
          programId={programId}
          durationMin={durationMin}
          initialCoaches={initialCoaches}
          initialAttendance={initialAttendance}
          candidateSubCoaches={candidateSubCoaches}
        />
      )}

      {/* 6. Financial breakdown */}
      <DisclosureCard
        title="Financial breakdown"
        hint={`Revenue ${formatCurrency(totalRevenueCents)} · Coach pay ${formatCurrency(totalCoachPay)} · Net ${formatCurrency(netProfit)}`}
        defaultOpen
      >
        {activeCharges.length > 0 ? (
          <>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Receipt className="size-4 text-primary" /> Player charges
            </h3>
            <div className="mt-2 overflow-hidden rounded-lg border border-border">
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
                    const family = charge.families as unknown as { id: string; display_id: string; family_name: string } | null
                    const hasEarlyBird = charge.type === 'early_bird' || (charge.type === 'term_enrollment' && program?.per_session_cents && charge.amount_cents < program.per_session_cents)
                    return (
                      <TableRow key={charge.id}>
                        <TableCell className="text-sm">
                          {player && family && charge.player_id ? (
                            <PlayerPill
                              familyId={family.id}
                              playerId={charge.player_id}
                              name={`${player.first_name} ${player.last_name}`}
                            />
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {family ? (
                            <FamilyPill familyId={family.id} displayId={family.display_id} familyName={family.family_name} />
                          ) : '-'}
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

            <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total revenue (inc GST)</span>
                <span className="font-medium tabular-nums">{formatCurrency(totalRevenueCents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GST (10%)</span>
                <span className="tabular-nums text-muted-foreground">−{formatCurrency(gstCents)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-sm font-medium">
                <span>Revenue ex-GST</span>
                <span className="tabular-nums">{formatCurrency(revenueExGst)}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No charges recorded for this session yet.</p>
        )}

        {coachPayRows.length > 0 && (
          <div className="mt-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GraduationCap className="size-4 text-primary" /> Coach pay
            </h3>
            <div className="mt-2 overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Coach</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Worked</TableHead>
                    <TableHead className="text-right">Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coachPayRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm font-medium">
                        <CoachPill coachId={row.id} name={row.name} />
                      </TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">{row.role}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {row.isOwner ? <span className="italic">Owner</span> : row.rateCents ? `${formatCurrency(row.rateCents)}/hr` : 'Rate not set'}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        <span className={row.status === 'partial' ? 'text-warning font-medium' : row.status === 'absent' ? 'text-danger font-medium' : 'text-muted-foreground'}>
                          {row.status === 'absent' ? '0 min' : `${row.effectiveMinutes} min`}
                        </span>
                        {row.note && (
                          <div className="text-xs text-muted-foreground italic mt-0.5">{row.note}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {row.isOwner ? '—' : row.rateCents
                          ? (row.payCents !== row.fullPayCents ? (
                              <span><span className="text-muted-foreground line-through mr-1">{formatCurrency(row.fullPayCents)}</span>{formatCurrency(row.payCents)}</span>
                            ) : formatCurrency(row.payCents))
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Revenue ex-GST</span>
                <span className="tabular-nums">{formatCurrency(revenueExGst)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coach pay</span>
                <span className="tabular-nums text-muted-foreground">
                  {fullCoachPay !== totalCoachPay && (
                    <span className="mr-1 line-through">{formatCurrency(fullCoachPay)}</span>
                  )}
                  −{formatCurrency(totalCoachPay)}
                </span>
              </div>
              <div className={`flex justify-between border-t border-border pt-2 text-sm font-bold ${netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                <span>Net profit</span>
                <span className="tabular-nums">{formatCurrency(netProfit)}</span>
              </div>
            </div>
          </div>
        )}
      </DisclosureCard>

      {/* 7. Lesson notes (collapsed) */}
      {(sessionNote || playerNotes.length > 0) && (
        <DisclosureCard
          title="Lesson notes"
          hint={
            sessionNote && playerNotes.length > 0 ? `${playerNotes.length} player note${playerNotes.length === 1 ? '' : 's'} + session note`
            : sessionNote ? 'Session note'
            : `${playerNotes.length} player note${playerNotes.length === 1 ? '' : 's'}`
          }
          defaultOpen={false}
        >
          {sessionNote && (
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="text-xs font-semibold text-muted-foreground">
                Session note · {(sessionNote.coaches as unknown as { name: string } | null)?.name ?? 'coach'}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{sessionNote.notes}</p>
            </div>
          )}
          {playerNotes.length > 0 && (
            <div className="mt-3 space-y-2">
              {playerNotes.map((note) => {
                const player = note.players as unknown as { id: string; first_name: string; last_name: string; family_id: string } | null
                return (
                  <div key={note.id} className="rounded-lg border border-border bg-card/40 p-3">
                    {player && (
                      <PlayerPill familyId={player.family_id} playerId={player.id} name={`${player.first_name} ${player.last_name}`} />
                    )}
                    {note.focus && <p className="mt-1 text-xs text-muted-foreground"><strong>Focus:</strong> {note.focus}</p>}
                    {note.progress && <p className="mt-0.5 text-xs text-muted-foreground"><strong>Progress:</strong> {note.progress}</p>}
                    {note.notes && <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{note.notes}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </DisclosureCard>
      )}
    </div>
  )
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="text-primary/70">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  )
}
