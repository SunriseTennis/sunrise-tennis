import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { EmptyState } from '@/components/empty-state'
import { Users, GraduationCap, ChevronRight, CalendarDays, MapPin } from 'lucide-react'
import { EnrolledCalendar } from './enrolled-calendar'

// Player card style — light pink matching nav bar
const PLAYER_CARD_STYLE = 'bg-[#FDD5D0] border border-[#F0B8B0] text-deep-navy'

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

  const today = new Date().toISOString().split('T')[0]

  // Pre-fetch player IDs for this family
  const { data: familyPlayerRows } = await supabase.from('players').select('id').eq('family_id', familyId)
  const familyPlayerIdList = familyPlayerRows?.map(p => p.id) ?? []

  const [
    { data: family },
    { data: players },
    { data: balance },
    { data: enrollments },
    { data: upcomingEvents },
    { data: privateBookings },
  ] = await Promise.all([
    supabase.from('families').select('*').eq('id', familyId).single(),
    supabase.from('players').select('*').eq('family_id', familyId).order('first_name'),
    supabase.from('family_balance').select('balance_cents, confirmed_balance_cents, projected_balance_cents').eq('family_id', familyId).single(),
    supabase
      .from('program_roster')
      .select('id, status, player_id, players!inner(id, first_name), programs:program_id(id, name, type, level, day_of_week, start_time, end_time, status)')
      .eq('status', 'enrolled')
      .in('player_id', familyPlayerIdList),
    supabase
      .from('club_events')
      .select('id, title, event_type, location, start_date, all_day, start_time, end_time')
      .gte('start_date', today)
      .in('status', ['upcoming', 'in_progress'])
      .order('start_date', { ascending: true })
      .limit(4),
    supabase
      .from('bookings')
      .select('id, player_id, duration_minutes, approval_status, sessions:session_id(date, start_time, end_time, status, coaches:coach_id(name)), players:player_id(first_name)')
      .eq('family_id', familyId)
      .eq('booking_type', 'private')
      .in('status', ['confirmed', 'pending'])
      .limit(20),
  ])

  // Fetch actual sessions for enrolled programs
  const enrolledProgramIds = [...new Set((enrollments ?? []).map(e => {
    const prog = e.programs as unknown as { id: string } | null
    return prog?.id
  }).filter(Boolean))] as string[]

  // Fetch sessions for enrolled programs
  const { data: rosterSessions } = enrolledProgramIds.length > 0
    ? await supabase
        .from('sessions')
        .select('id, program_id, date, start_time, end_time, status')
        .in('program_id', enrolledProgramIds)
        .eq('status', 'scheduled')
        .order('date')
    : { data: [] }

  // Also fetch sessions where players have attendance records (booked via calendar)
  const { data: attendedSessions } = familyPlayerIdList.length > 0
    ? await supabase
        .from('attendances')
        .select('session_id, sessions:session_id(id, program_id, date, start_time, end_time, status)')
        .in('player_id', familyPlayerIdList)
        .eq('status', 'present')
    : { data: [] }

  // Merge and deduplicate sessions
  type SessionRow = { id: string; program_id: string | null; date: string; start_time: string | null; end_time: string | null; status: string }
  const enrolledSessions: SessionRow[] = (() => {
    const map = new Map<string, SessionRow>()
    for (const s of (rosterSessions ?? []) as SessionRow[]) map.set(s.id, s)
    for (const a of attendedSessions ?? []) {
      const s = a.sessions as unknown as SessionRow | null
      if (s && s.status === 'scheduled' && !map.has(s.id)) {
        map.set(s.id, s)
      }
    }
    return [...map.values()]
  })()

  const contact = family?.primary_contact as { name?: string; phone?: string; email?: string } | null
  const balanceCents = balance?.projected_balance_cents ?? balance?.balance_cents ?? 0
  const firstName = contact?.name?.split(' ')[0] ?? 'Parent'

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Welcome back</p>
            <h1 className="text-2xl font-bold">{firstName}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-white/70">Upcoming Balance</p>
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

      {/* ── Two-column: Players + Upcoming Events ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Players */}
        <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <h2 className="text-lg font-semibold text-foreground">
            Your Players
          </h2>

          {players && players.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {players.map((player, i) => (
                  <Link
                    key={player.id}
                    href={`/parent/players/${player.id}`}
                    className={`group relative block overflow-hidden rounded-xl p-4 shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] hover:bg-[#FAC8C0] ${PLAYER_CARD_STYLE}`}
                    style={{ animationDelay: `${(i + 1) * 80}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold truncate">
                        {player.first_name} {player.last_name}
                      </p>
                      <ChevronRight className="size-4 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5" />
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
                compact
              />
            </div>
          )}
        </section>

        {/* Upcoming Events */}
        <section className="animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Upcoming Events</h2>
            <Link href="/parent/events" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              View all
            </Link>
          </div>

          {upcomingEvents && upcomingEvents.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {upcomingEvents.map((event) => {
                const date = new Date(event.start_date + 'T00:00:00')
                const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-card"
                  >
                    <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-[#FDD5D0] text-deep-navy">
                      <span className="text-[10px] font-medium uppercase leading-none">{MONTHS[date.getMonth()]}</span>
                      <span className="text-sm font-bold leading-none">{date.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">{event.title}</p>
                      {event.location && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState
                icon={CalendarDays}
                title="No upcoming events"
                description="Check back later for club events."
                compact
              />
            </div>
          )}
        </section>
      </div>

      {/* ── Weekly Schedule ── */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="text-lg font-semibold text-foreground">
          Weekly Schedule
        </h2>

        {(enrollments && enrollments.length > 0) || (privateBookings && privateBookings.length > 0) ? (
          <div className="mt-3">
            <EnrolledCalendar
              playerOrder={players?.map(p => p.first_name) ?? []}
              familyPlayers={players?.map(p => ({ id: p.id, name: p.first_name })) ?? []}
              enrollments={(enrollments ?? []).map((enrollment) => {
                const program = enrollment.programs as unknown as {
                  id: string; name: string; type: string; level: string; status: string
                } | null
                const enrolledPlayer = enrollment.players as unknown as { id: string; first_name: string } | null
                return {
                  id: enrollment.id,
                  playerId: (enrollment as unknown as { player_id: string }).player_id ?? enrolledPlayer?.id ?? '',
                  playerName: enrolledPlayer?.first_name ?? '',
                  programId: program?.id ?? '',
                  programName: program?.name ?? '',
                  programType: program?.type ?? '',
                  programLevel: program?.level ?? null,
                }
              })}
              sessions={(enrolledSessions ?? []).map(s => ({
                id: s.id,
                program_id: s.program_id,
                date: s.date,
                start_time: s.start_time,
                end_time: s.end_time,
              }))}
              privateBookings={(privateBookings ?? []).map((b) => {
                const session = b.sessions as unknown as { date: string; start_time: string; end_time: string; status: string; coaches: { name: string } | null } | null
                const player = b.players as unknown as { first_name: string } | null
                const dayOfWeek = session?.date ? new Date(session.date + 'T12:00:00').getDay() : null
                return {
                  id: b.id,
                  playerName: player?.first_name ?? '',
                  programName: `Private w/ ${(session?.coaches?.name ?? 'Coach').split(' ')[0]}`,
                  dayOfWeek,
                  startTime: session?.start_time ?? null,
                  endTime: session?.end_time ?? null,
                  date: session?.date ?? null,
                  sessionId: (b as unknown as { session_id: string }).session_id ?? null,
                  approvalStatus: (b as unknown as { approval_status: string | null }).approval_status ?? null,
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

    </div>
  )
}
