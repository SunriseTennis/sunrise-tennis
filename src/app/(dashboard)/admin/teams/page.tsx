import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function AdminTeamsPage() {
  const supabase = await createClient()

  const { data: teams } = await supabase
    .from('teams')
    .select('*, coaches:coach_id(name), programs:program_id(name)')
    .order('name')

  // Get member counts per team
  const { data: memberCounts } = await supabase
    .from('team_members')
    .select('team_id')

  const countMap = new Map<string, number>()
  memberCounts?.forEach((m) => {
    countMap.set(m.team_id, (countMap.get(m.team_id) ?? 0) + 1)
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="mt-1 text-sm text-gray-600">Manage competition teams, rosters, and availability.</p>
        </div>
        <Link
          href="/admin/teams/new"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Create Team
        </Link>
      </div>

      {teams && teams.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Team</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Season</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Coach</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Program</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Members</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {teams.map((team) => {
                const coach = team.coaches as unknown as { name: string } | null
                const program = team.programs as unknown as { name: string } | null
                return (
                  <tr key={team.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <Link href={`/admin/teams/${team.id}`} className="hover:text-orange-600">
                        {team.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{team.season ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{coach?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{program?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{countMap.get(team.id) ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        team.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {team.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-500">No teams created yet.</p>
      )}
    </div>
  )
}
