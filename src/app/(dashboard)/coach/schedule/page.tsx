import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { PageHeader } from '@/components/page-header'
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
import { Calendar } from 'lucide-react'

export default async function CoachSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
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
        <PageHeader title="Schedule" />
        <p className="mt-4 text-sm text-muted-foreground">Coach profile not linked.</p>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const showPast = filter === 'past'

  let query = supabase
    .from('sessions')
    .select('*, programs:program_id(name, level, type), venues:venue_id(name)')
    .eq('coach_id', coachId)
    .order('date', { ascending: !showPast })
    .order('start_time')
    .limit(50)

  if (showPast) {
    query = query.lt('date', today)
  } else {
    query = query.gte('date', today)
  }

  const { data: sessions } = await query

  return (
    <div>
      <PageHeader
        title="Schedule"
        description="Your assigned sessions."
        action={
          <Button asChild variant="outline">
            <Link href={showPast ? '/coach/schedule' : '/coach/schedule?filter=past'}>
              {showPast ? 'Upcoming' : 'Past sessions'}
            </Link>
          </Button>
        }
      />

      {sessions && sessions.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
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
                    <TableCell>
                      <StatusBadge status={session.status ?? 'scheduled'} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={Calendar}
            title={showPast ? 'No past sessions found' : 'No upcoming sessions'}
            description={showPast ? 'Past sessions will appear here.' : 'Sessions assigned to you will appear here.'}
          />
        </div>
      )}
    </div>
  )
}
