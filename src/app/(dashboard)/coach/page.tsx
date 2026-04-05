import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar, Clock, MapPin, AlertCircle, ChevronRight } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function CoachDashboard() {
  const supabase = await createClient()

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const coachId = coach?.id

  if (!coachId) {
    return (
      <div className="space-y-6">
        <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
          <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="relative">
            <p className="text-sm font-medium text-white/80">Coach</p>
            <h1 className="text-2xl font-bold">Dashboard</h1>
          </div>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="No coach profile linked"
          description="Your account hasn't been linked to a coach profile yet. Please contact an admin."
        />
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  const [{ data: todaySessions }, { data: upcomingSessions }, { data: coachProfile }] = await Promise.all([
    supabase
      .from('sessions')
      .select('*, programs:program_id(name, level, type), venues:venue_id(name)')
      .eq('coach_id', coachId)
      .eq('date', today)
      .order('start_time'),
    supabase
      .from('sessions')
      .select('*, programs:program_id(name, level, type), venues:venue_id(name)')
      .eq('coach_id', coachId)
      .gt('date', today)
      .eq('status', 'scheduled')
      .order('date')
      .order('start_time')
      .limit(10),
    supabase
      .from('coaches')
      .select('name')
      .eq('id', coachId)
      .single(),
  ])

  const sessionCount = todaySessions?.length ?? 0

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">{DAYS[new Date().getDay()]}, {formatDate(new Date())}</p>
            <h1 className="text-2xl font-bold">Welcome, {coachProfile?.name ?? 'Coach'}</h1>
            <p className="mt-0.5 text-sm text-white/70">
              {sessionCount === 0 ? 'No sessions today' : `${sessionCount} session${sessionCount !== 1 ? 's' : ''} today`}
            </p>
          </div>
          <Link href="/coach/schedule" className="text-right group">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-white/30">
              Full schedule <ChevronRight className="size-3" />
            </span>
          </Link>
        </div>
      </div>

      {/* ── Today's Sessions ── */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <h2 className="text-lg font-semibold text-deep-navy">Today&apos;s Sessions</h2>

        {todaySessions && todaySessions.length > 0 ? (
          <div className="mt-3 grid gap-3">
            {todaySessions.map((session, i) => {
              const program = session.programs as unknown as { name: string; level: string; type: string } | null
              const venue = session.venues as unknown as { name: string } | null
              return (
                <Link
                  key={session.id}
                  href={`/coach/schedule/${session.id}`}
                  className="animate-fade-up block"
                  style={{ animationDelay: `${120 + i * 60}ms` }}
                >
                  <div className="rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-elevated">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-deep-navy">{program?.name ?? session.session_type}</p>
                        <div className="mt-1 flex items-center gap-3 text-sm text-slate-blue">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3.5" />
                            {session.start_time ? formatTime(session.start_time) : ''}
                            {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                          </span>
                          {venue && (
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3.5" />
                              {venue.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={session.status} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={Calendar}
              title="No sessions today"
              description="Enjoy the time off — check the schedule for upcoming sessions."
            />
          </div>
        )}
      </section>

      {/* ── Upcoming Sessions ── */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-deep-navy">Upcoming Sessions</h2>
          <Button asChild variant="link" size="sm">
            <Link href="/coach/schedule">View all</Link>
          </Button>
        </div>

        {upcomingSessions && upcomingSessions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#FFF6ED] hover:bg-[#FFF6ED]">
                  <TableHead>Date</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Venue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingSessions.map((session) => {
                  const program = session.programs as unknown as { name: string; level: string; type: string } | null
                  const venue = session.venues as unknown as { name: string } | null
                  return (
                    <TableRow key={session.id} className="hover:bg-[#FFFBF7]">
                      <TableCell>
                        <Link href={`/coach/schedule/${session.id}`} className="font-medium text-deep-navy hover:text-primary transition-colors">
                          {formatDate(session.date)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-deep-navy">{program?.name ?? session.session_type}</TableCell>
                      <TableCell className="text-slate-blue">
                        {session.start_time ? formatTime(session.start_time) : '-'}
                        {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                      </TableCell>
                      <TableCell className="text-slate-blue">{venue?.name ?? '-'}</TableCell>
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
              description="No sessions scheduled."
            />
          </div>
        )}
      </section>
    </div>
  )
}
