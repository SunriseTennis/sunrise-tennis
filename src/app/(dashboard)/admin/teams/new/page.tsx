import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createTeam } from '../actions'

export default async function NewTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: programs }, { data: coaches }] = await Promise.all([
    supabase.from('programs').select('id, name').eq('status', 'active').order('name'),
    supabase.from('coaches').select('id, name').eq('status', 'active').order('name'),
  ])

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/teams" className="text-sm text-gray-500 hover:text-gray-700">&larr; Teams</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">Create Team</h1>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form action={createTeam} className="mt-6 space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Team Name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. U12 Boys A"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        <div>
          <label htmlFor="season" className="block text-sm font-medium text-gray-700">Season</label>
          <input
            id="season"
            name="season"
            type="text"
            placeholder="e.g. Summer 2026, Term 2 2026"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        <div>
          <label htmlFor="coach_id" className="block text-sm font-medium text-gray-700">Coach</label>
          <select
            id="coach_id"
            name="coach_id"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">None</option>
            {coaches?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="program_id" className="block text-sm font-medium text-gray-700">
            Linked Program <span className="text-gray-400">(optional)</span>
          </label>
          <select
            id="program_id"
            name="program_id"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">None</option>
            {programs?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Create Team
          </button>
        </div>
      </form>
    </div>
  )
}
