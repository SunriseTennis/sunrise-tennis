import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar, Clock, MapPin, AlertCircle } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function CoachDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const coachId = coach?.id

  if (!coachId) {
    return (
      <div>
        <PageHeader title="Coach Dashboard" />
        <div className="mt-6">
          <EmptyState
            icon={AlertCircle}
            title="No coach profile linked"
            description="Your account hasn't been linked to a coach profile yet. Please contact an admin."
          />
        </div>
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

  return (
    <div>
      <PageHeader
        title={`Welcome, ${coachProfile?.name ?? 'Coach'}`}
        description={`${DAYS[new Date().getDay()]}, ${formatDate(new Date())}`}
      />

      {/* Today's Sessions */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Today&apos;s Sessions</h2>

        {todaySessions && todaySessions.length > 0 ? (
          <div className="mt-3 grid gap-3">
            {todaySessions.map((session) => {
              const program = session.programs as unknown as { name: string; level: string; type: string } | null
              const venue = session.venues as unknown as { name: string } | null
              return (
                <Link
                  key={session.id}
                  href={`/coach/schedule/${session.id}`}
                  className="block"
                >
                  <Card className="transition-all hover:border-primary/30 hover:shadow-elevated">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-semibold text-foreground">{program?.name ?? session.session_type}</p>
                        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
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
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={Calendar}
              title="No sessions today"
              description="No sessions scheduled for today."
            />
          </div>
        )}
      </div>

      {/* Upcoming Sessions */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Upcoming Sessions</h2>
          <Button asChild variant="link" size="sm">
            <Link href="/coach/schedule">View all</Link>
          </Button>
        </div>

        {upcomingSessions && upcomingSessions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
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
                    <TableRow key={session.id}>
                      <TableCell>
                        <Link href={`/coach/schedule/${session.id}`} className="font-medium hover:text-primary transition-colors">
                          {formatDate(session.date)}
                        </Link>
                      </TableCell>
                      <TableCell>{program?.name ?? session.session_type}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {session.start_time ? formatTime(session.start_time) : '-'}
                        {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{venue?.name ?? '-'}</TableCell>
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
      </div>
    </div>
  )
}
