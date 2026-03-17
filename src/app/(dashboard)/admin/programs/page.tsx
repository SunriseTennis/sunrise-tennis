import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function ProgramsPage() {
  const supabase = await createClient()

  const { data: programs } = await supabase
    .from('programs')
    .select('*, program_roster(count)')
    .order('day_of_week')
    .order('start_time')

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
        <Link
          href="/admin/programs/new"
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          + Add program
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Level</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Day / Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Enrolled</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Per Session</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {programs && programs.length > 0 ? (
              programs.map((p) => {
                const enrolled = (p.program_roster as unknown as { count: number }[])?.[0]?.count ?? 0
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <Link href={`/admin/programs/${p.id}`} className="hover:text-orange-600">{p.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{p.type}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{p.level}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {p.day_of_week != null ? DAYS[p.day_of_week] : '-'}
                      {p.start_time && ` ${formatTime(p.start_time)}`}
                      {p.end_time && ` - ${formatTime(p.end_time)}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {enrolled}{p.max_capacity ? `/${p.max_capacity}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">
                      {p.per_session_cents ? formatCurrency(p.per_session_cents) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No programs yet. <Link href="/admin/programs/new" className="text-orange-600 hover:text-orange-500">Add one</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
