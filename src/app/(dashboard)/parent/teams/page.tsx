import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ParentTeamsPage() {
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

  // Get family's players
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('family_id', userRole.family_id)

  const playerIds = players?.map((p) => p.id) ?? []

  // Get teams these players are on
  const { data: memberships } = playerIds.length > 0
    ? await supabase
        .from('team_members')
        .select('team_id, player_id, role, teams:team_id(id, name, season, status, coaches:coach_id(name))')
        .in('player_id', playerIds)
    : { data: [] }

  // Get pending availability checks
  const teamIds = [...new Set(memberships?.map((m) => m.team_id) ?? [])]
  const { data: pendingAvailability } = teamIds.length > 0
    ? await supabase
        .from('availability')
        .select('team_id')
        .in('team_id', teamIds)
        .in('player_id', playerIds)
        .eq('status', 'pending')
    : { data: [] }

  const pendingByTeam = new Map<string, number>()
  pendingAvailability?.forEach((a) => {
    pendingByTeam.set(a.team_id, (pendingByTeam.get(a.team_id) ?? 0) + 1)
  })

  // Group by team
  const teamMap = new Map<string, { team: { id: string; name: string; season: string | null; status: string; coach: string | null }; pending: number }>()
  memberships?.forEach((m) => {
    const team = m.teams as unknown as { id: string; name: string; season: string | null; status: string; coaches: { name: string } | null }
    if (team && !teamMap.has(team.id)) {
      teamMap.set(team.id, {
        team: { id: team.id, name: team.name, season: team.season, status: team.status, coach: team.coaches?.name ?? null },
        pending: pendingByTeam.get(team.id) ?? 0,
      })
    }
  })

  const teams = [...teamMap.values()]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
      <p className="mt-1 text-sm text-gray-600">Your children&apos;s competition teams.</p>

      {teams.length > 0 ? (
        <div className="mt-6 space-y-4">
          {teams.map(({ team, pending }) => (
            <Link
              key={team.id}
              href={`/parent/teams/${team.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 transition-colors hover:border-orange-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{team.name}</h2>
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                    {team.season && <span>{team.season}</span>}
                    {team.coach && <span>Coach: {team.coach}</span>}
                  </div>
                </div>
                {pending > 0 && (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                    {pending} pending
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-500">Your children are not on any teams yet.</p>
      )}
    </div>
  )
}
