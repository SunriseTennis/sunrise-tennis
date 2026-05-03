import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { ChevronLeft, Clock, MapPin } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { SessionPlayerActions } from './session-player-actions'

export default async function ParentSessionDetail({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { sessionId } = await params
  const { error, success } = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()
  if (!userRole?.family_id) redirect('/login')
  const familyId = userRole.family_id

  // Session + program metadata
  const { data: session } = await supabase
    .from('sessions')
    .select(`
      id, date, start_time, end_time, status, session_type, program_id,
      coaches:coach_id(name),
      programs:program_id(id, name, type, level, day_of_week)
    `)
    .eq('id', sessionId)
    .single()

  if (!session) notFound()

  const program = session.programs as unknown as {
    id: string
    name: string
    type: string
    level: string | null
    day_of_week: number | null
  } | null

  // Family players + their relationship to this session.
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('first_name')

  const playerIds = (players ?? []).map((p) => p.id)

  // Term-enrolment lookup (program_roster) — only for the session's program.
  let rosteredIds = new Set<string>()
  if (program?.id && playerIds.length > 0) {
    const { data: rosterRows } = await supabase
      .from('program_roster')
      .select('player_id')
      .eq('program_id', program.id)
      .eq('status', 'enrolled')
      .in('player_id', playerIds)
    rosteredIds = new Set((rosterRows ?? []).map((r) => r.player_id))
  }

  // Attendance rows for this session — used to detect casual-booked + per-player status.
  const { data: attendances } = playerIds.length > 0
    ? await supabase
        .from('attendances')
        .select('player_id, status')
        .eq('session_id', sessionId)
        .in('player_id', playerIds)
    : { data: [] as { player_id: string; status: string }[] }
  const attendanceByPlayer = new Map<string, string>(
    (attendances ?? []).map((a) => [a.player_id, a.status]),
  )

  type RelationKind = 'term_enrolled' | 'casual_booked' | 'not_on_session'

  type PlayerRel = {
    id: string
    name: string
    relation: RelationKind
    attendanceStatus: string | null
  }

  const playerRows: PlayerRel[] = (players ?? []).map((p) => {
    const att = attendanceByPlayer.get(p.id) ?? null
    let relation: RelationKind = 'not_on_session'
    if (rosteredIds.has(p.id)) relation = 'term_enrolled'
    else if (att && att !== 'cancelled') relation = 'casual_booked'
    return {
      id: p.id,
      name: `${p.first_name} ${p.last_name ?? ''}`.trim(),
      relation,
      attendanceStatus: att,
    }
  })

  const onSession = playerRows.filter((p) => p.relation !== 'not_on_session')
  const otherPlayers = playerRows.filter((p) => p.relation === 'not_on_session')

  const isPast = !!(session.date && new Date(`${session.date}T${session.start_time ?? '00:00'}`) < new Date())
  const isCancelled = session.status === 'cancelled'
  const coachName = (session.coaches as unknown as { name: string } | null)?.name ?? null

  return (
    <div className="space-y-4">
      <Link
        href={program ? `/parent/programs/${program.id}` : '/parent'}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> {program ? program.name : 'Back'}
      </Link>

      <div className="rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <p className="text-sm font-medium text-white/80">{program?.name ?? 'Session'}</p>
        <h1 className="text-2xl font-bold leading-tight">
          {session.date ? formatDate(session.date) : 'Session'}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {session.start_time && session.end_time
            ? `${formatTime(session.start_time)} – ${formatTime(session.end_time)}`
            : ''}
          {coachName ? ` · with ${coachName.split(' ')[0]}` : ''}
        </p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-3 text-sm text-red-700">{decodeURIComponent(error)}</CardContent>
        </Card>
      )}
      {success && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-3 text-sm text-emerald-700">{decodeURIComponent(success)}</CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={isCancelled ? 'cancelled' : session.status} />
          </div>
          {session.start_time && session.end_time && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-3.5 shrink-0" />
              <span>{formatTime(session.start_time)} – {formatTime(session.end_time)}</span>
            </div>
          )}
          {coachName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span>{coachName}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {isCancelled && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-4 text-sm text-red-700">
            This session has been cancelled.
          </CardContent>
        </Card>
      )}

      {!isCancelled && onSession.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Your players on this session</h2>
            <div className="space-y-2">
              {onSession.map((p) => (
                <SessionPlayerActions
                  key={p.id}
                  sessionId={sessionId}
                  playerId={p.id}
                  playerName={p.name}
                  relation={p.relation as 'term_enrolled' | 'casual_booked'}
                  attendanceStatus={p.attendanceStatus}
                  isPast={isPast}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Players in family but not on this session — informational only */}
      {!isCancelled && otherPlayers.length > 0 && program && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Other players in your family</p>
            <p>
              {otherPlayers.map((p) => p.name).join(', ')} {otherPlayers.length === 1 ? 'is' : 'are'} not booked into this session.
              Visit the program page to book.
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
