import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { AttendanceForm } from './attendance-form'
import { CancelSessionForm } from './cancel-session-form'
import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { sessionId } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('*, programs:program_id(id, name, level, type), coaches:coach_id(name), venues:venue_id(name)')
    .eq('id', sessionId)
    .single()

  if (!session) notFound()

  const program = session.programs as unknown as { id: string; name: string; level: string; type: string } | null
  const coach = session.coaches as unknown as { name: string } | null
  const venue = session.venues as unknown as { name: string } | null

  // Get roster for this program (the expected players)
  let rosterPlayers: { id: string; first_name: string; last_name: string }[] = []
  if (program?.id) {
    const { data: roster } = await supabase
      .from('program_roster')
      .select('players:player_id(id, first_name, last_name)')
      .eq('program_id', program.id)
      .eq('status', 'enrolled')

    rosterPlayers = roster?.map(r => r.players as unknown as { id: string; first_name: string; last_name: string }).filter(Boolean) ?? []
  }

  // Get existing attendance records
  const { data: attendances } = await supabase
    .from('attendances')
    .select('player_id, status, notes')
    .eq('session_id', sessionId)

  const attendanceMap = new Map(attendances?.map(a => [a.player_id, a.status]) ?? [])

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${program?.name ?? session.session_type} - ${formatDate(session.date)}`}
        breadcrumbs={[{ label: 'Sessions', href: '/admin/sessions' }]}
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
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Coach</dt>
                <dd className="text-sm text-foreground">{coach?.name ?? 'Unassigned'}</dd>
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

        {/* Attendance */}
        {session.status !== 'cancelled' && rosterPlayers.length > 0 && (
          <Suspense>
            <AttendanceForm
              sessionId={sessionId}
              players={rosterPlayers}
              attendanceMap={Object.fromEntries(attendanceMap)}
            />
          </Suspense>
        )}

        {session.status !== 'cancelled' && rosterPlayers.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
              <p className="mt-2 text-sm text-muted-foreground">No players on the roster for this session.</p>
            </CardContent>
          </Card>
        )}

        {/* Cancel session */}
        {session.status === 'scheduled' && (
          <Suspense>
            <CancelSessionForm sessionId={sessionId} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
