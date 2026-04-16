import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { getTermForDate, getNextTermStart } from '@/lib/utils/school-terms'
import { EmptyState } from '@/components/empty-state'
import { ImageHero } from '@/components/image-hero'
import { Users, GraduationCap, ChevronRight, CalendarDays, MapPin, UserPlus, CreditCard, Calendar, Megaphone } from 'lucide-react'
import { EnrolledCalendar } from './enrolled-calendar'
import { PreChargeBanner } from './pre-charge-banner'
import { CoachingMomentStrip, type UpcomingMoment } from './coaching-moment-strip'

// Player card style — warm sunset accent
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

  // Fetch latest unread announcement for banner
  const { data: latestAnnouncement } = await supabase
    .from('notification_recipients')
    .select(`
      id,
      read_at,
      notifications:notification_id(title, body, url, type)
    `)
    .eq('user_id', user.id)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const announcement = latestAnnouncement && (latestAnnouncement.notifications as unknown as { type: string; title: string; body: string | null; url: string | null })?.type === 'announcement'
    ? {
        id: latestAnnouncement.id,
        title: (latestAnnouncement.notifications as unknown as { title: string }).title,
        body: (latestAnnouncement.notifications as unknown as { body: string | null }).body,
        url: (latestAnnouncement.notifications as unknown as { url: string | null }).url,
      }
    : null

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

  // Fetch per-session attendance for overview calendar actions
  const sessionIds = enrolledSessions.map(s => s.id)
  const { data: overviewAttendances } = sessionIds.length > 0 && familyPlayerIdList.length > 0
    ? await supabase
        .from('attendances')
        .select('session_id, player_id, status')
        .in('session_id', sessionIds)
        .in('player_id', familyPlayerIdList)
    : { data: [] }

  const contact = family?.primary_contact as { name?: string; phone?: string; email?: string } | null
  const balanceCents = balance?.confirmed_balance_cents ?? balance?.balance_cents ?? 0
  const firstName = contact?.name?.split(' ')[0] ?? 'Parent'

  // Compute next session from enrolled sessions
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const currentTime = now.toTimeString().slice(0, 5)
  const nextSession = enrolledSessions
    .filter(s => s.date > todayStr || (s.date === todayStr && (s.start_time ?? '') > currentTime))
    .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))[0] ?? null

  // Find program name for next session
  const nextSessionProgram = nextSession
    ? (enrollments ?? []).find(e => {
        const prog = e.programs as unknown as { id: string; name: string } | null
        return prog?.id === nextSession.program_id
      })
    : null
  const nextProgramName = nextSessionProgram
    ? (nextSessionProgram.programs as unknown as { name: string })?.name
    : null

  // Format next session date
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const nextSessionLabel = nextSession
    ? (() => {
        const d = new Date(nextSession.date + 'T12:00:00')
        const dayName = DAYS[d.getDay()]
        const day = d.getDate()
        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const month = MONTHS[d.getMonth()]
        const time = nextSession.start_time ? formatTime(nextSession.start_time) : ''
        return `${dayName} ${day} ${month}${time ? `, ${time}` : ''}`
      })()
    : null

  // Coaching-moment strip data: flatten today's enrolled group sessions + private bookings
  // into { playerName, startAt, programName, href } entries for the client strip.
  const coachingMoments: UpcomingMoment[] = (() => {
    const out: UpcomingMoment[] = []
    // Group sessions — use first enrolled player from this family as the name
    for (const s of enrolledSessions) {
      if (!s.program_id || !s.start_time) continue
      // Find a player from this family enrolled in that program
      const enrolment = (enrollments ?? []).find(e => {
        const prog = e.programs as unknown as { id: string } | null
        return prog?.id === s.program_id
      })
      const playerName = (enrolment?.players as unknown as { first_name: string } | null)?.first_name
      const programName = (enrolment?.programs as unknown as { name: string } | null)?.name
      if (!playerName || !programName) continue
      out.push({
        playerName,
        startAt: `${s.date}T${s.start_time}`,
        programName,
        href: `/parent/programs`,
      })
    }
    // Private bookings
    for (const b of privateBookings ?? []) {
      const session = b.sessions as unknown as { date: string; start_time: string | null; status: string; coaches: { name: string } | null } | null
      const player = b.players as unknown as { first_name: string } | null
      if (!session?.date || !session.start_time || session.status !== 'scheduled' || !player?.first_name) continue
      out.push({
        playerName: player.first_name,
        startAt: `${session.date}T${session.start_time}`,
        programName: `Private with ${session.coaches?.name ?? 'coach'}`,
        href: `/parent/bookings`,
      })
    }
    return out
  })()

  // Term break awareness
  const isTermBreak = !getTermForDate(now)
  const nextTermStart = isTermBreak ? getNextTermStart(now) : null

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <ImageHero src="/images/tennis/hero-sunset.jpg" alt="Tennis court at golden hour">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Welcome back</p>
            <h1 className="text-2xl font-bold">{firstName}</h1>
            {nextSessionLabel && nextProgramName && (
              <p className="mt-1 text-sm text-white/80">
                <Calendar className="mr-1 inline size-3.5 align-text-bottom" />
                Next: <span className="font-medium text-white">{nextProgramName}</span> &mdash; {nextSessionLabel}
              </p>
            )}
            {!nextSession && isTermBreak && nextTermStart && (
              <p className="mt-1 text-sm text-white/80">
                Term break &mdash; sessions resume {DAYS[nextTermStart.getDay()]} {nextTermStart.getDate()} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][nextTermStart.getMonth()]}
              </p>
            )}
          </div>
          <Link href="/parent/payments" className="text-right group">
            <p className="text-xs font-medium text-white/70">Current Balance</p>
            <p className={`text-2xl font-bold tabular-nums ${
              balanceCents < 0 ? 'text-red-200' :
              balanceCents > 0 ? 'text-emerald-200' :
              'text-white'
            }`}>
              {formatCurrency(balanceCents)}
            </p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-white/30">
              {balanceCents < 0 ? 'Pay now' : 'View payments'} <ChevronRight className="size-3" />
            </span>
          </Link>
        </div>
      </ImageHero>

      {/* ── Announcement Banner ── */}
      {announcement && (
        <div className="animate-fade-up" style={{ animationDelay: '40ms' }}>
          <Link
            href={announcement.url || '/parent/notifications'}
            className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm shadow-card transition-all hover:shadow-elevated press-scale"
          >
            <Megaphone className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="font-semibold text-amber-900">{announcement.title}</p>
              {announcement.body && <p className="mt-0.5 text-amber-700 line-clamp-2">{announcement.body}</p>}
            </div>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-amber-400" />
          </Link>
        </div>
      )}

      {/* ── Pre-Charge Heads-up Banner ── */}
      <PreChargeBanner familyId={familyId} />

      {/* ── Quick Actions ── */}
      <div className="animate-fade-up flex gap-2 overflow-x-auto pb-1" style={{ animationDelay: '60ms' }}>
        <Link href="/parent/bookings" className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-deep-navy shadow-card transition-all hover:shadow-elevated press-scale">
          <UserPlus className="size-3.5 text-primary" />
          Book Private
        </Link>
        <Link href="/parent/payments" className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-deep-navy shadow-card transition-all hover:shadow-elevated press-scale">
          <CreditCard className="size-3.5 text-primary" />
          Make Payment
        </Link>
        <Link href="/parent/programs" className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-deep-navy shadow-card transition-all hover:shadow-elevated press-scale">
          <GraduationCap className="size-3.5 text-primary" />
          Browse Programs
        </Link>
      </div>

      <div className="section-divider" />

      {/* ── Coaching-moment strip ── */}
      <CoachingMomentStrip moments={coachingMoments} />

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
                    className={`group relative block overflow-hidden rounded-xl p-4 shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] hover:bg-[#FAC8C0] press-scale ${PLAYER_CARD_STYLE}`}
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
                description="Your players will appear here once your coach adds them."
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
                description="We'll post socials and tournaments here!"
                compact
              />
            </div>
          )}
        </section>
      </div>

      <div className="section-divider" />

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
              attendances={(overviewAttendances ?? []) as { session_id: string; player_id: string; status: string }[]}
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
              title="No sessions scheduled"
              description="Browse programs to get started!"
              compact
              action={
                <Link href="/parent/programs" className="text-xs font-medium text-primary hover:text-primary/80">
                  Browse
                </Link>
              }
            />
          </div>
        )}
      </section>

    </div>
  )
}
