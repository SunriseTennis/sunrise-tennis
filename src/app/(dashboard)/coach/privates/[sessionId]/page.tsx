import { redirect, notFound } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { completePrivateSession, createLessonNote } from '../../actions'

export default async function CoachPrivateSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { sessionId } = await params
  const { error, success } = await searchParams
  const { coachId } = await requireCoach()
  if (!coachId) return redirect('/coach?error=No+coach+profile+found') as never

  const supabase = await createClient()

  // Get session with booking and player details
  const { data: session } = await supabase
    .from('sessions')
    .select('id, date, start_time, end_time, status, duration_minutes, session_type, coach_id')
    .eq('id', sessionId)
    .eq('coach_id', coachId)
    .eq('session_type', 'private')
    .single()

  if (!session) notFound()

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, player_id, family_id, price_cents, duration_minutes,
      players:player_id(id, first_name, last_name, ball_color, dob),
      families:family_id(family_name, primary_contact)
    `)
    .eq('session_id', sessionId)
    .eq('booking_type', 'private')
    .single()

  const player = booking?.players as unknown as { id: string; first_name: string; last_name: string; ball_color: string | null; dob: string | null } | null
  const family = booking?.families as unknown as { family_name: string; primary_contact: { name?: string; phone?: string } | null } | null

  // Get past lesson notes for this player with this coach
  const { data: pastNotes } = player ? await supabase
    .from('lesson_notes')
    .select('id, focus, progress, notes, drills_used, created_at, sessions:session_id(date)')
    .eq('player_id', player.id)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .limit(5) : { data: null }

  // Get existing note for this session
  const { data: existingNote } = player ? await supabase
    .from('lesson_notes')
    .select('id, focus, progress, notes, drills_used')
    .eq('session_id', sessionId)
    .eq('player_id', player.id)
    .single() : { data: null }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Private Session"
        breadcrumbs={[{ label: 'Privates', href: '/coach/privates' }]}
        action={<StatusBadge status={session.status} />}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decodeURIComponent(error)}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {decodeURIComponent(success)}
        </div>
      )}

      {/* Session details */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{formatDate(session.date)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Time</span>
            <span className="font-medium">
              {session.start_time && formatTime(session.start_time)} – {session.end_time && formatTime(session.end_time)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-medium">{session.duration_minutes ?? booking?.duration_minutes}min</span>
          </div>
        </CardContent>
      </Card>

      {/* Player info */}
      {player && family && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold">Player</h3>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-medium">{player.first_name} {player.last_name}</p>
              {player.ball_color && (
                <p className="text-xs capitalize text-muted-foreground">{player.ball_color} ball</p>
              )}
              {player.dob && (
                <p className="text-xs text-muted-foreground">DOB: {formatDate(player.dob)}</p>
              )}
              <div className="mt-2 border-t border-border pt-2">
                <p className="text-xs text-muted-foreground">
                  Parent: {family.primary_contact?.name ?? family.family_name}
                </p>
                {family.primary_contact?.phone && (
                  <p className="text-xs text-muted-foreground">
                    Phone: <a href={`tel:${family.primary_contact.phone}`} className="text-primary hover:underline">{family.primary_contact.phone}</a>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete button */}
      {session.status === 'scheduled' && (
        <form action={completePrivateSession.bind(null, sessionId)}>
          <Button type="submit" className="w-full">
            Mark Session Complete
          </Button>
        </form>
      )}

      {/* Lesson note form */}
      {session.status === 'completed' && player && !existingNote && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold">Add Lesson Note</h3>
            <form action={createLessonNote.bind(null, sessionId)} className="mt-3 space-y-3">
              <input type="hidden" name="player_id" value={player.id} />
              <div>
                <label className="text-xs font-medium">Focus</label>
                <input name="focus" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="What was worked on" />
              </div>
              <div>
                <label className="text-xs font-medium">Progress</label>
                <textarea name="progress" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={2} placeholder="How did they go" />
              </div>
              <div>
                <label className="text-xs font-medium">Drills Used</label>
                <input name="drills_used" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Comma separated" />
              </div>
              <div>
                <label className="text-xs font-medium">Notes</label>
                <textarea name="notes" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} placeholder="Additional notes" />
              </div>
              <Button type="submit" size="sm">Save Note</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {existingNote && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold">Session Note</h3>
            {existingNote.focus && <p className="mt-2 text-sm"><span className="text-muted-foreground">Focus:</span> {existingNote.focus}</p>}
            {existingNote.progress && <p className="text-sm"><span className="text-muted-foreground">Progress:</span> {existingNote.progress}</p>}
            {existingNote.notes && <p className="text-sm"><span className="text-muted-foreground">Notes:</span> {existingNote.notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Past lesson notes */}
      {pastNotes && pastNotes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Past Lesson Notes</h3>
          <div className="space-y-2">
            {pastNotes.map((note) => {
              const noteSession = note.sessions as unknown as { date: string } | null
              return (
                <Card key={note.id} className="opacity-70">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{noteSession?.date ? formatDate(noteSession.date) : ''}</p>
                    {note.focus && <p className="text-xs mt-1"><span className="text-muted-foreground">Focus:</span> {note.focus}</p>}
                    {note.progress && <p className="text-xs"><span className="text-muted-foreground">Progress:</span> {note.progress}</p>}
                    {note.notes && <p className="text-xs"><span className="text-muted-foreground">Notes:</span> {note.notes}</p>}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
