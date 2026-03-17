import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils/dates'
import { PlayerEditForm } from './player-edit-form'

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
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/families" className="hover:text-gray-700">Families</Link>
        <span>/</span>
        <Link href={`/admin/families/${familyId}`} className="hover:text-gray-700">
          {family.display_id} - {family.family_name}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{player.first_name} {player.last_name}</span>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">{player.first_name} {player.last_name}</h1>

      <div className="mt-6 space-y-6">
        {/* Current state */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Player Profile</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">Ball Colour</dt>
              <dd className="text-sm text-gray-900 capitalize">{player.ball_color ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Level</dt>
              <dd className="text-sm text-gray-900 capitalize">{player.level ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Date of Birth</dt>
              <dd className="text-sm text-gray-900">{player.dob ? formatDate(player.dob) : '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Status</dt>
              <dd className="text-sm text-gray-900 capitalize">{player.status}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">Current Focus</dt>
              <dd className="text-sm text-gray-900">{player.current_focus?.join(', ') ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Short-term Goal</dt>
              <dd className="text-sm text-gray-900">{player.short_term_goal ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Long-term Goal</dt>
              <dd className="text-sm text-gray-900">{player.long_term_goal ?? '-'}</dd>
            </div>
            {player.medical_notes && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-gray-500">Medical Notes</dt>
                <dd className="text-sm text-gray-900">{player.medical_notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Edit form */}
        <PlayerEditForm player={player} familyId={familyId} />
      </div>
    </div>
  )
}
