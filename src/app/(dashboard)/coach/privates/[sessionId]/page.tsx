import { redirect, notFound } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { UserMinus } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { completePrivateSession, createLessonNote } from '../../actions'
import { convertSharedToSolo } from '@/app/(dashboard)/admin/privates/actions'

function ConvertButton({ sessionId, removingPlayerId }: { sessionId: string; removingPlayerId: string }) {
  return (
    <form action={convertSharedToSolo} className="inline">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="removing_player_id" value={removingPlayerId} />
      <input type="hidden" name="reason" value="Coach: partner cancelled" />
      <Button type="submit" size="sm" variant="ghost" className="h-7 gap-1 text-xs text-amber-700 hover:bg-amber-50">
        <UserMinus className="size-3" /> Mark cancelled
      </Button>
    </form>
  )
}

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

  const { data: bookingsRaw } = await supabase
    .from('bookings')
    .select(`
      id, player_id, family_id, price_cents, duration_minutes, status,
      players:player_id(id, first_name, last_name, classifications, dob),
      families:family_id(family_name, primary_contact)
    `)
    .eq('session_id', sessionId)
    .eq('booking_type', 'private')

  type BookingRow = {
    id: string
    player_id: string
    family_id: string
    price_cents: number | null
    duration_minutes: number | null
    status: string
    players: { id: string; first_name: string; last_name: string; classifications: string[] | null; dob: string | null } | null
    families: { family_name: string; primary_contact: { name?: string; phone?: string } | null } | null
  }
  const bookings = (bookingsRaw ?? []) as unknown as BookingRow[]
  // Surface non-cancelled players for the attendance + note workflow
  const activeBookings = bookings.filter(b => b.status !== 'cancelled')
  const isShared = activeBookings.length >= 2

  // For backward compatibility, treat the first booking as the "primary" view
  const primaryBooking = activeBookings[0] ?? null
  const player = primaryBooking?.players ?? null
  const family = primaryBooking?.families ?? null

  // Past notes follow the primary player (each player has their own history elsewhere).
  const { data: pastNotes } = player ? await supabase
    .from('lesson_notes')
    .select('id, focus, progress, notes, drills_used, created_at, sessions:session_id(date)')
    .eq('player_id', player.id)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .limit(5) : { data: null }

  // Existing notes for THIS session, keyed by player_id
  const playerIds = activeBookings.map(b => b.players?.id).filter((x): x is string => !!x)
  const { data: existingNotesAll } = playerIds.length > 0 ? await supabase
    .from('lesson_notes')
    .select('id, player_id, focus, progress, notes, drills_used')
    .eq('session_id', sessionId)
    .in('player_id', playerIds) : { data: null }
  const existingNotesByPlayer = new Map<string, { id: string; focus: string | null; progress: string | null; notes: string | null; drills_used: string[] | null }>()
  for (const n of (existingNotesAll ?? [])) {
    if (n.player_id) existingNotesByPlayer.set(n.player_id, n)
  }
  const existingNote = player ? existingNotesByPlayer.get(player.id) ?? null : null

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
            <span className="font-medium">{session.duration_minutes ?? primaryBooking?.duration_minutes}min</span>
          </div>
        </CardContent>
      </Card>

      {/* Player info */}
      {activeBookings.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold">{isShared ? 'Players (shared)' : 'Player'}</h3>
            <div className="mt-2 space-y-3">
              {activeBookings.map((b, idx) => {
                const p = b.players
                const f = b.families
                if (!p) return null
                return (
                  <div key={b.id} className={idx > 0 ? 'border-t border-border pt-3' : ''}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{p.first_name} {p.last_name}</p>
                      {isShared && session.status === 'scheduled' && (
                        <ConvertButton sessionId={sessionId} removingPlayerId={p.id} />
                      )}
                    </div>
                    {(p.classifications ?? []).length > 0 && (
                      <p className="text-xs capitalize text-muted-foreground">{(p.classifications ?? []).join(' / ')}</p>
                    )}
                    {p.dob && (
                      <p className="text-xs text-muted-foreground">DOB: {formatDate(p.dob)}</p>
                    )}
                    {f && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {f.primary_contact?.name ?? f.family_name}
                        {f.primary_contact?.phone && (
                          <> &middot; <a href={`tel:${f.primary_contact.phone}`} className="text-primary hover:underline">{f.primary_contact.phone}</a></>
                        )}
                      </p>
                    )}
                  </div>
                )
              })}
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
