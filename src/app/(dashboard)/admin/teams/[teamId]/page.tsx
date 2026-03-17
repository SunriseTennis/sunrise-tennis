import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils/dates'
import { AddMemberForm } from './add-member-form'
import { AvailabilityGrid } from './availability-grid'
import { sendAvailabilityCheck, removeTeamMember } from '../actions'

export default async function AdminTeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { teamId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const [
    { data: team },
    { data: members },
    { data: availability },
    { data: allPlayers },
  ] = await Promise.all([
    supabase
      .from('teams')
      .select('*, coaches:coach_id(name), programs:program_id(name)')
      .eq('id', teamId)
      .single(),
    supabase
      .from('team_members')
      .select('*, players:player_id(first_name, last_name, ball_color, family_id)')
      .eq('team_id', teamId)
      .order('role'),
    supabase
      .from('availability')
      .select('*')
      .eq('team_id', teamId)
      .order('match_date', { ascending: false }),
    supabase
      .from('players')
      .select('id, first_name, last_name, ball_color')
      .eq('status', 'active')
      .order('first_name'),
  ])

  if (!team) notFound()

  const coach = team.coaches as unknown as { name: string } | null
  const program = team.programs as unknown as { name: string } | null
  const memberPlayerIds = new Set(members?.map((m) => m.player_id) ?? [])
  const eligiblePlayers = allPlayers?.filter((p) => !memberPlayerIds.has(p.id)) ?? []

  // Group availability by date
  const availabilityByDate = new Map<string, typeof availability>()
  availability?.forEach((a) => {
    const existing = availabilityByDate.get(a.match_date) ?? []
    existing.push(a)
    availabilityByDate.set(a.match_date, existing)
  })

  const removeAction = removeTeamMember.bind(null, teamId)
  const availabilityAction = sendAvailabilityCheck.bind(null, teamId)

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link href="/admin/teams" className="text-sm text-gray-500 hover:text-gray-700">&larr; Teams</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
          team.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
        }`}>
          {team.status}
        </span>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Team Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 lg:col-span-1">
          <h2 className="text-lg font-semibold text-gray-900">Details</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs font-medium text-gray-500">Season</dt>
              <dd className="text-sm text-gray-900">{team.season ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Coach</dt>
              <dd className="text-sm text-gray-900">{coach?.name ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Program</dt>
              <dd className="text-sm text-gray-900">{program?.name ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Members</dt>
              <dd className="text-sm text-gray-900">{members?.length ?? 0}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <Link
              href={`/admin/teams/${teamId}/chat`}
              className="inline-block rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Team Chat
            </Link>
          </div>
        </div>

        {/* Members */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Roster</h2>

          {members && members.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Player</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Level</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Role</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {members.map((m) => {
                    const player = m.players as unknown as { first_name: string; last_name: string; ball_color: string | null }
                    return (
                      <tr key={m.id}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {player?.first_name} {player?.last_name}
                        </td>
                        <td className="px-4 py-2 text-sm capitalize text-gray-500">{player?.ball_color ?? '-'}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            m.role === 'captain' ? 'bg-yellow-100 text-yellow-700' :
                            m.role === 'reserve' ? 'bg-gray-100 text-gray-600' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {m.role}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <form action={removeAction}>
                            <input type="hidden" name="member_id" value={m.id} />
                            <button type="submit" className="text-xs text-red-500 hover:text-red-700">Remove</button>
                          </form>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">No members yet.</p>
          )}

          <div className="mt-4">
            <AddMemberForm teamId={teamId} players={eligiblePlayers} />
          </div>
        </div>
      </div>

      {/* Availability Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Availability</h2>
        </div>

        {/* Send availability check form */}
        <form action={availabilityAction} className="mt-4 flex items-end gap-3">
          <div>
            <label htmlFor="match_date" className="block text-xs font-medium text-gray-700">Match Date</label>
            <input
              id="match_date"
              name="match_date"
              type="date"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Send Availability Check
          </button>
        </form>

        {/* Availability grid */}
        {availabilityByDate.size > 0 && members && (
          <div className="mt-4">
            <AvailabilityGrid
              members={members.map((m) => {
                const player = m.players as unknown as { first_name: string; last_name: string }
                return { id: m.player_id, name: `${player.first_name} ${player.last_name}` }
              })}
              dates={[...availabilityByDate.keys()].slice(0, 8)}
              availability={availability ?? []}
            />
          </div>
        )}
      </div>
    </div>
  )
}
