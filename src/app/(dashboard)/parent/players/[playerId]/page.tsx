import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function ParentPlayerDetailPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const supabase = await createClient()

  // Verify parent owns this player via family_id
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  const familyId = userRole?.family_id
  if (!familyId) redirect('/parent')

  // Fetch player (scoped to this family)
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('family_id', familyId)
    .single()

  if (!player) notFound()

  // Fetch enrolled programs and recent lesson notes in parallel
  const [{ data: enrollments }, { data: lessonNotes }] = await Promise.all([
    supabase
      .from('program_roster')
      .select('id, status, enrolled_at, programs:program_id(id, name, type, level, day_of_week, start_time, end_time)')
      .eq('player_id', playerId)
      .eq('status', 'enrolled'),
    supabase
      .from('lesson_notes')
      .select('id, focus, notes, progress, next_plan, drills_used, video_url, created_at, sessions:session_id(date, programs:program_id(name))')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const currentFocus = player.current_focus as string[] | null

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${player.first_name} ${player.last_name}`}
        breadcrumbs={[{ label: 'Overview', href: '/parent' }]}
        action={<StatusBadge status={player.status ?? 'active'} />}
      />

      <div className="mt-6 space-y-8">
        {/* Player Profile */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Player Profile</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Ball Colour</dt>
                <dd className="text-sm capitalize text-foreground">{player.ball_color ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Level</dt>
                <dd className="text-sm capitalize text-foreground">{player.level ?? '-'}</dd>
              </div>
              {player.dob && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Date of Birth</dt>
                  <dd className="text-sm text-foreground">{formatDate(player.dob)}</dd>
                </div>
              )}
              {currentFocus && currentFocus.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Current Focus Areas</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {currentFocus.map((focus) => (
                      <Badge key={focus} variant="secondary" className="capitalize">
                        {focus}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}
              {player.short_term_goal && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Short-Term Goal</dt>
                  <dd className="text-sm text-foreground">{player.short_term_goal}</dd>
                </div>
              )}
              {player.long_term_goal && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Long-Term Goal</dt>
                  <dd className="text-sm text-foreground">{player.long_term_goal}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Enrolled Programs */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Enrolled Programs</h2>

            {enrollments && enrollments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {enrollments.map((enrollment) => {
                  const program = enrollment.programs as unknown as {
                    id: string; name: string; type: string; level: string;
                    day_of_week: number | null; start_time: string | null; end_time: string | null
                  } | null
                  if (!program) return null
                  return (
                    <div key={enrollment.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground">{program.name}</p>
                        <Badge variant="secondary" className="capitalize">
                          {program.type}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {program.day_of_week != null && DAYS[program.day_of_week]}
                        {program.start_time && ` · ${formatTime(program.start_time)}`}
                        {program.end_time && ` - ${formatTime(program.end_time)}`}
                      </p>
                      {program.level && (
                        <p className="mt-1 text-xs capitalize text-muted-foreground/60">{program.level} level</p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Not enrolled in any programs.</p>
            )}
          </CardContent>
        </Card>

        {/* Lesson Notes */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Recent Lesson Notes</h2>

            {lessonNotes && lessonNotes.length > 0 ? (
              <div className="mt-4 space-y-4">
                {lessonNotes.map((note) => {
                  const session = note.sessions as unknown as { date: string; programs: { name: string } | null } | null
                  const drills = note.drills_used as string[] | null
                  return (
                    <div key={note.id} className="border-l-2 border-primary/40 pl-4">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {session?.date ? formatDate(session.date) : 'Unknown date'}
                        </p>
                        {session?.programs?.name && (
                          <span className="text-xs text-muted-foreground/60">· {session.programs.name}</span>
                        )}
                      </div>
                      {note.focus && (
                        <p className="mt-1 text-sm text-foreground">
                          <span className="font-medium">Focus:</span> {note.focus}
                        </p>
                      )}
                      {note.notes && (
                        <p className="mt-1 text-sm text-muted-foreground">{note.notes}</p>
                      )}
                      {note.progress && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Progress:</span> {note.progress}
                        </p>
                      )}
                      {note.next_plan && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Next plan:</span> {note.next_plan}
                        </p>
                      )}
                      {drills && drills.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground/60">Drills: {drills.join(', ')}</p>
                      )}
                      {note.video_url && (
                        <a
                          href={note.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-primary hover:text-primary/80 transition-colors"
                        >
                          Watch video &rarr;
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No lesson notes yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
