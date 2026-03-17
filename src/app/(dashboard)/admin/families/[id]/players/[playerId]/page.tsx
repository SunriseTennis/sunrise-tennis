import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils/dates'
import { PlayerEditForm } from './player-edit-form'
import { Card, CardContent } from '@/components/ui/card'

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string; playerId: string }>
}) {
  const { id: familyId, playerId } = await params
  const supabase = await createClient()

  const [{ data: player }, { data: family }] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('families').select('display_id, family_name').eq('id', familyId).single(),
  ])

  if (!player || !family) notFound()

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/families" className="hover:text-foreground">Families</Link>
        <span>/</span>
        <Link href={`/admin/families/${familyId}`} className="hover:text-foreground">
          {family.display_id} - {family.family_name}
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{player.first_name} {player.last_name}</span>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-foreground">{player.first_name} {player.last_name}</h1>

      <div className="mt-6 space-y-6">
        {/* Current state */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Player Profile</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Ball Colour</dt>
                <dd className="text-sm text-foreground capitalize">{player.ball_color ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Level</dt>
                <dd className="text-sm text-foreground capitalize">{player.level ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Date of Birth</dt>
                <dd className="text-sm text-foreground">{player.dob ? formatDate(player.dob) : '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                <dd className="text-sm text-foreground capitalize">{player.status}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Current Focus</dt>
                <dd className="text-sm text-foreground">{player.current_focus?.join(', ') ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Short-term Goal</dt>
                <dd className="text-sm text-foreground">{player.short_term_goal ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Long-term Goal</dt>
                <dd className="text-sm text-foreground">{player.long_term_goal ?? '-'}</dd>
              </div>
              {player.medical_notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Medical Notes</dt>
                  <dd className="text-sm text-foreground">{player.medical_notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Edit form */}
        <PlayerEditForm player={player} familyId={familyId} />
      </div>
    </div>
  )
}
