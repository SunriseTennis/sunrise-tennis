import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { CoachAttendanceForm } from './coach-attendance-form'
import { LessonNoteForm } from './lesson-note-form'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export default async function CoachSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { sessionId } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch session details
  const { data: session } = await supabase
    .from('sessions')
    .select('*, programs:program_id(id, name, level, type), venues:venue_id(name), coaches:coach_id(name)')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return (
      <div>
        <PageHeader title="Session not found" />
        <Link href="/coach/schedule" className="mt-2 text-sm text-primary hover:text-primary/80 transition-colors">
          Back to schedule
        </Link>
      </div>
    )
  }

  const program = session.programs as unknown as { id: string; name: string; level: string; type: string } | null
  const venue = session.venues as unknown as { name: string } | null

  // Get roster and existing attendance + lesson notes
  const [{ data: rosterData }, { data: attendances }, { data: lessonNotes }] = await Promise.all([
    program?.id
      ? supabase
          .from('program_roster')
          .select('players:player_id(id, first_name, last_name, ball_color)')
          .eq('program_id', program.id)
          .eq('status', 'enrolled')
      : Promise.resolve({ data: null }),
    supabase
      .from('attendances')
      .select('player_id, status')
      .eq('session_id', sessionId),
    supabase
      .from('lesson_notes')
      .select('*, players:player_id(first_name, last_name)')
      .eq('session_id', sessionId)
      .order('created_at'),
  ])

  const roster = rosterData?.map(r => r.players as unknown as {
    id: string; first_name: string; last_name: string; ball_color: string | null
  }).filter(Boolean) ?? []

  const attendanceMap = new Map(
    attendances?.map(a => [a.player_id, a.status]) ?? []
  )

  return (
    <div>
      <PageHeader
        title={program?.name ?? session.session_type}
        description={`${formatDate(session.date)}${session.start_time ? ` · ${formatTime(session.start_time)}` : ''}${session.end_time ? ` - ${formatTime(session.end_time)}` : ''}${venue ? ` · ${venue.name}` : ''}`}
        breadcrumbs={[{ label: 'Schedule', href: '/coach/schedule' }]}
        action={<StatusBadge status={session.status ?? 'scheduled'} />}
      />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Attendance */}
      {roster.length > 0 && session.status !== 'cancelled' && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
          <CoachAttendanceForm
            sessionId={sessionId}
            roster={roster}
            attendanceMap={Object.fromEntries(attendanceMap)}
          />
        </div>
      )}

      {/* Existing Lesson Notes */}
      {lessonNotes && lessonNotes.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Lesson Notes</h2>
          <div className="mt-3 space-y-3">
            {lessonNotes.map((note) => {
              const player = note.players as unknown as { first_name: string; last_name: string } | null
              return (
                <Card key={note.id}>
                  <CardContent className="pt-4">
                    <p className="font-medium text-foreground">
                      {player?.first_name} {player?.last_name}
                    </p>
                    {note.focus && <p className="mt-1 text-sm text-muted-foreground"><strong className="text-foreground">Focus:</strong> {note.focus}</p>}
                    {note.progress && <p className="mt-1 text-sm text-muted-foreground"><strong className="text-foreground">Progress:</strong> {note.progress}</p>}
                    {note.drills_used && (note.drills_used as string[]).length > 0 && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        <strong className="text-foreground">Drills:</strong> {(note.drills_used as string[]).join(', ')}
                      </p>
                    )}
                    {note.next_plan && <p className="mt-1 text-sm text-muted-foreground"><strong className="text-foreground">Next plan:</strong> {note.next_plan}</p>}
                    {note.video_url && (
                      <p className="mt-1 text-sm">
                        <a href={note.video_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                          Video link
                        </a>
                      </p>
                    )}
                    {note.notes && <p className="mt-1 text-sm text-muted-foreground">{note.notes}</p>}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Add Lesson Note Form */}
      {session.status !== 'cancelled' && roster.length > 0 && (
        <div className="mt-8">
          <LessonNoteForm sessionId={sessionId} roster={roster} />
        </div>
      )}
    </div>
  )
}
