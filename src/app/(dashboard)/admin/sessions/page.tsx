import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { CreateSessionForm } from './create-session-form'
import { Suspense } from 'react'
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
import { Calendar, AlertCircle } from 'lucide-react'

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; filter?: string }>
}) {
  const { error, filter } = await searchParams
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const showPast = filter === 'past'

  // Fetch sessions
  let query = supabase
    .from('sessions')
    .select('*, programs:program_id(name, level, type), coaches:coach_id(name), venues:venue_id(name)')
    .order('date', { ascending: !showPast })
    .order('start_time')
    .limit(50)

  if (showPast) {
    query = query.lt('date', today)
  } else {
    query = query.gte('date', today)
  }

  const [{ data: sessions }, { data: programs }, { data: coaches }, { data: venues }] = await Promise.all([
    query,
    supabase.from('programs').select('id, name').eq('status', 'active').order('name'),
    supabase.from('coaches').select('id, name').eq('status', 'active').order('name'),
    supabase.from('venues').select('id, name').order('name'),
  ])

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="Manage sessions and mark attendance."
        action={
          <Button asChild variant="outline">
            <Link href={showPast ? '/admin/sessions' : '/admin/sessions?filter=past'}>
              {showPast ? 'Upcoming' : 'Past sessions'}
            </Link>
          </Button>
        }
      />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {sessions && sessions.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Coach</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
                const program = session.programs as unknown as { name: string; level: string; type: string } | null
                const coach = session.coaches as unknown as { name: string } | null
                const venue = session.venues as unknown as { name: string } | null
                return (
                  <TableRow key={session.id}>
                    <TableCell>
                      <Link href={`/admin/sessions/${session.id}`} className="font-medium hover:text-primary transition-colors">
                        {formatDate(session.date)}
                      </Link>
                    </TableCell>
                    <TableCell>{program?.name ?? session.session_type}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {session.start_time ? formatTime(session.start_time) : '-'}
                      {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{coach?.name ?? '-'}</TableCell>
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
            description={showPast ? 'Past sessions will appear here.' : 'Create a session to get started.'}
          />
        </div>
      )}

      {/* Create session form */}
      <div className="mt-8">
        <Suspense>
          <CreateSessionForm
            programs={programs ?? []}
            coaches={coaches ?? []}
            venues={venues ?? []}
          />
        </Suspense>
      </div>
    </div>
  )
}
