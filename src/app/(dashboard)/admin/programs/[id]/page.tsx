import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { ProgramEditForm } from './program-edit-form'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: program }, { data: roster }] = await Promise.all([
    supabase.from('programs').select('*').eq('id', id).single(),
    supabase.from('program_roster')
      .select('id, status, enrolled_at, players(id, first_name, last_name, ball_color, families(display_id, family_name))')
      .eq('program_id', id)
      .order('enrolled_at'),
  ])

  if (!program) notFound()

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/programs" className="text-sm text-gray-500 hover:text-gray-700">&larr; Programs</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{program.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
          program.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
        }`}>
          {program.status}
        </span>
      </div>

      <div className="mt-6 space-y-8">
        {/* Program details */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Program Details</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-gray-500">Type</dt>
              <dd className="text-sm text-gray-900 capitalize">{program.type}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Level</dt>
              <dd className="text-sm text-gray-900 capitalize">{program.level}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Day</dt>
              <dd className="text-sm text-gray-900">{program.day_of_week != null ? DAYS[program.day_of_week] : '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Time</dt>
              <dd className="text-sm text-gray-900">
                {program.start_time ? formatTime(program.start_time) : '-'}
                {program.end_time ? ` - ${formatTime(program.end_time)}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Capacity</dt>
              <dd className="text-sm text-gray-900">{program.max_capacity ?? 'Unlimited'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Per Session</dt>
              <dd className="text-sm text-gray-900">{program.per_session_cents ? formatCurrency(program.per_session_cents) : '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Term Fee</dt>
              <dd className="text-sm text-gray-900">{program.term_fee_cents ? formatCurrency(program.term_fee_cents) : '-'}</dd>
            </div>
            {program.description && (
              <div className="sm:col-span-3">
                <dt className="text-xs font-medium text-gray-500">Description</dt>
                <dd className="text-sm text-gray-900">{program.description}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Roster */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Roster ({roster?.length ?? 0}{program.max_capacity ? `/${program.max_capacity}` : ''})
          </h2>
          {roster && roster.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Player</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Family</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Level</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {roster.map((r) => {
                    const player = r.players as unknown as { id: string; first_name: string; last_name: string; ball_color: string | null; families: { display_id: string; family_name: string } | null } | null
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {player?.first_name} {player?.last_name}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {player?.families?.display_id} ({player?.families?.family_name})
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600 capitalize">{player?.ball_color ?? '-'}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            r.status === 'enrolled' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">No players enrolled yet.</p>
          )}
        </div>

        {/* Edit */}
        <ProgramEditForm program={program} />
      </div>
    </div>
  )
}
