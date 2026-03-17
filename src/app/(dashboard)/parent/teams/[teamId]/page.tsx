import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AvailabilityForm } from './availability-form'
import { respondToAvailability } from '../actions'

export default async function ParentTeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { teamId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) redirect('/parent')

  const { data: team } = await supabase
    .from('teams')
    .select('*, coaches:coach_id(name)')
    .eq('id', teamId)
    .single()

  if (!team) notFound()

  const coach = team.coaches as unknown as { name: string } | null

  // Get family's players on this team
  const { data: familyPlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .eq('family_id', userRole.family_id)

  const familyPlayerIds = familyPlayers?.map((p) => p.id) ?? []

  const { data: memberships } = await supabase
    .from('team_members')
    .select('player_id, role')
    .eq('team_id', teamId)
    .in('player_id', familyPlayerIds)

  const memberPlayerIds = memberships?.map((m) => m.player_id) ?? []

  // Get pending availability for family's players
  const { data: pendingAvailability } = memberPlayerIds.length > 0
    ? await supabase
        .from('availability')
        .select('*')
        .eq('team_id', teamId)
        .in('player_id', memberPlayerIds)
        .order('match_date')
    : { data: [] }

  // Get all team members for roster display
  const { data: allMembers } = await supabase
    .from('team_members')
    .select('*, players:player_id(first_name, last_name, ball_color)')
    .eq('team_id', teamId)
    .order('role')

  const playersOnTeam = familyPlayers?.filter((p) => memberPlayerIds.includes(p.id)) ?? []
  const pendingChecks = pendingAvailability?.filter((a) => a.status === 'pending' || a.status === 'maybe') ?? []
  const action = respondToAvailability.bind(null, teamId)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/parent/teams" className="text-sm text-gray-500 hover:text-gray-700">&larr; Teams</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <div className="mt-6 space-y-6">
        {/* Team info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">Season</dt>
              <dd className="text-sm text-gray-900">{team.season ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Coach</dt>
              <dd className="text-sm text-gray-900">{coach?.name ?? '-'}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <Link
              href={`/parent/teams/${teamId}/chat`}
              className="inline-block rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Team Chat
            </Link>
          </div>
        </div>

        {/* Availability response */}
        {pendingChecks.length > 0 && playersOnTeam.length > 0 && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-6">
            <h2 className="text-lg font-semibold text-orange-800">Availability Check</h2>
            <p className="mt-1 text-sm text-orange-700">Please respond for each of your players.</p>
            <div className="mt-4">
              <AvailabilityForm
                players={playersOnTeam}
                pendingAvailability={pendingChecks}
                action={action}
              />
            </div>
          </div>
        )}

        {/* Previous responses */}
        {pendingAvailability && pendingAvailability.filter((a) => a.status !== 'pending').length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Your Responses</h2>
            <div className="mt-3 space-y-2">
              {pendingAvailability.filter((a) => a.status !== 'pending').map((a) => {
                const player = playersOnTeam.find((p) => p.id === a.player_id)
                return (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-900">
                      {player?.first_name} - {new Date(a.match_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      a.status === 'available' ? 'bg-green-100 text-green-700' :
                      a.status === 'unavailable' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {a.status}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Full team roster */}
        {allMembers && allMembers.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Team Roster</h2>
            <div className="mt-3 space-y-2">
              {allMembers.map((m) => {
                const player = m.players as unknown as { first_name: string; last_name: string; ball_color: string | null }
                return (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-900">{player?.first_name} {player?.last_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      m.role === 'captain' ? 'bg-yellow-100 text-yellow-700' :
                      m.role === 'reserve' ? 'bg-gray-100 text-gray-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {m.role}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
