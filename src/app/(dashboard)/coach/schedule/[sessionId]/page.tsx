import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { CoachAttendanceForm } from './coach-attendance-form'
import { LessonNoteForm } from './lesson-note-form'
import { AssistantCoachForm } from './assistant-coach-form'
import { SessionNoteForm } from './session-note-form'
import { AddPlayerForm } from './add-player-form'
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

  const user = await getSessionUser()
  if (!user) redirect('/login')

  // Get coach ID
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const coachId = coach?.id

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

  // Get roster, attendance, lesson notes, assistant coaches, and session notes
  const [
    { data: rosterData },
    { data: attendances },
    { data: lessonNotes },
    { data: programCoaches },
    { data: coachAttendances },
  ] = await Promise.all([
    program?.id
      ? supabase
          .from('program_roster')
          .select('players:player_id(id, first_name, last_name, classifications, current_focus)')
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
    program?.id
      ? supabase
          .from('program_coaches')
          .select('coach_id, role, coaches:coach_id(id, name)')
          .eq('program_id', program.id)
      : Promise.resolve({ data: null }),
    supabase
      .from('session_coach_attendances')
      .select('coach_id, status')
      .eq('session_id', sessionId),
  ])

  const enrolledRoster = rosterData?.map(r => r.players as unknown as {
    id: string; first_name: string; last_name: string; classifications: string[] | null; current_focus: string[] | null
  }).filter(Boolean) ?? []

  const attendanceMap = new Map(
    attendances?.map(a => [a.player_id, a.status]) ?? []
  )

  // Find walk-in players (have attendance but not in roster) and merge
  const enrolledIds = new Set(enrolledRoster.map(r => r.id))
  const walkInPlayerIds = (attendances ?? [])
    .map(a => a.player_id)
    .filter(pid => !enrolledIds.has(pid))

  let walkInPlayers: typeof enrolledRoster = []
  if (walkInPlayerIds.length > 0) {
    const { data: walkIns } = await supabase
      .from('players')
      .select('id, first_name, last_name, classifications, current_focus')
      .in('id', walkInPlayerIds)
    walkInPlayers = (walkIns ?? []).map(p => ({
      ...p,
      current_focus: p.current_focus as string[] | null,
    }))
  }

  const roster = [...enrolledRoster, ...walkInPlayers]

  // Fetch previous session notes for prep view (only for scheduled sessions)
  let prevNotesMap: Record<string, { focus: string | null; progress: string | null; notes: string | null }> = {}
  if (session.status === 'scheduled' && program?.id && roster.length > 0) {
    // Get the most recent completed session for this program before current date
    const { data: prevSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('program_id', program.id)
      .eq('status', 'completed')
      .lt('date', session.date)
      .order('date', { ascending: false })
      .limit(1)

    if (prevSessions && prevSessions.length > 0) {
      const { data: prevNotes } = await supabase
        .from('lesson_notes')
        .select('player_id, focus, progress, notes')
        .eq('session_id', prevSessions[0].id)
        .not('player_id', 'is', null)

      for (const n of prevNotes ?? []) {
        if (n.player_id) {
          prevNotesMap[n.player_id] = { focus: n.focus, progress: n.progress, notes: n.notes }
        }
      }
    }
  }

  // Check if current coach is lead
  const isLead = coachId && (
    session.coach_id === coachId ||
    (programCoaches ?? []).some(pc =>
      pc.role === 'primary' &&
      (pc.coaches as unknown as { id: string })?.id === coachId
    )
  )

  // Assistant coaches (exclude lead)
  const assistantCoaches = (programCoaches ?? [])
    .filter(pc => pc.role === 'assistant')
    .map(pc => pc.coaches as unknown as { id: string; name: string })
    .filter(Boolean)

  const coachAttendanceMap = Object.fromEntries(
    (coachAttendances ?? []).map(ca => [ca.coach_id, ca.status])
  )

  // Session-level notes (player_id is null)
  const sessionNote = (lessonNotes ?? []).find(n => n.player_id === null)
  const playerNotes = (lessonNotes ?? []).filter(n => n.player_id !== null)

  // Existing player IDs for walk-in exclusion
  const existingPlayerIds = roster.map(r => r.id)

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

      <div className="mt-6 space-y-8">
        {/* Session Prep (upcoming sessions only) */}
        {session.status === 'scheduled' && roster.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <details>
                <summary className="cursor-pointer text-lg font-semibold text-foreground">
                  Session Prep
                </summary>
                <div className="mt-3 space-y-3">
                  {roster.map((player) => {
                    const prevNote = prevNotesMap[player.id]
                    const hasFocus = player.current_focus && player.current_focus.length > 0
                    if (!hasFocus && !prevNote) return null
                    return (
                      <div key={player.id} className="rounded-lg border border-border p-3">
                        <p className="font-medium text-sm text-foreground">{player.first_name} {player.last_name}</p>
                        {hasFocus && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {player.current_focus!.map((f, i) => (
                              <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                        {prevNote && (
                          <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                            {prevNote.focus && <p><strong className="text-foreground">Last focus:</strong> {prevNote.focus}</p>}
                            {prevNote.progress && <p><strong className="text-foreground">Progress:</strong> {prevNote.progress}</p>}
                            {prevNote.notes && <p>{prevNote.notes}</p>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </details>
            </CardContent>
          </Card>
        )}

        {/* Attendance */}
        {roster.length > 0 && session.status !== 'cancelled' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
            <CoachAttendanceForm
              sessionId={sessionId}
              roster={roster}
              attendanceMap={Object.fromEntries(attendanceMap)}
            />
          </div>
        )}

        {/* Assistant Coach Attendance (lead only) */}
        {isLead && assistantCoaches.length > 0 && session.status !== 'cancelled' && (
          <Card>
            <CardContent className="pt-6">
              <AssistantCoachForm
                sessionId={sessionId}
                coaches={assistantCoaches}
                attendanceMap={coachAttendanceMap}
              />
            </CardContent>
          </Card>
        )}

        {/* Walk-in Player Add (lead only) */}
        {isLead && session.status !== 'cancelled' && (
          <Card>
            <CardContent className="pt-6">
              <AddPlayerForm
                sessionId={sessionId}
                existingPlayerIds={existingPlayerIds}
              />
            </CardContent>
          </Card>
        )}

        {/* Session Notes (lead only) */}
        {isLead && session.status !== 'cancelled' && (
          <Card>
            <CardContent className="pt-6">
              <SessionNoteForm
                sessionId={sessionId}
                existingNote={sessionNote?.notes ?? undefined}
              />
            </CardContent>
          </Card>
        )}

        {/* Existing Per-Player Lesson Notes */}
        {playerNotes.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Lesson Notes</h2>
            <div className="mt-3 space-y-3">
              {playerNotes.map((note) => {
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
          <div>
            <LessonNoteForm sessionId={sessionId} roster={roster} />
          </div>
        )}
      </div>
    </div>
  )
}
