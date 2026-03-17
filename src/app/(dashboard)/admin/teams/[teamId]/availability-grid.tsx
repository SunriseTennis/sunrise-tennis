'use client'

interface AvailabilityRecord {
  id: string
  team_id: string
  player_id: string
  match_date: string
  status: string
  responded_at: string | null
  note: string | null
}

interface Props {
  members: { id: string; name: string }[]
  dates: string[]
  availability: AvailabilityRecord[]
}

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-500 text-white',
  unavailable: 'bg-red-500 text-white',
  maybe: 'bg-yellow-400 text-gray-900',
  pending: 'bg-gray-200 text-gray-500',
}

export function AvailabilityGrid({ members, dates, availability }: Props) {
  // Build lookup: `${playerId}-${date}` -> record
  const lookup = new Map<string, AvailabilityRecord>()
  availability.forEach((a) => {
    lookup.set(`${a.player_id}-${a.match_date}`, a)
  })

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Player</th>
            {dates.map((d) => (
              <th key={d} className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                {new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {members.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-2 text-sm text-gray-900">{m.name}</td>
              {dates.map((d) => {
                const record = lookup.get(`${m.id}-${d}`)
                const status = record?.status ?? 'pending'
                return (
                  <td key={d} className="px-3 py-2 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[status] ?? STATUS_COLORS.pending}`}
                      title={record?.note ?? undefined}
                    >
                      {status === 'pending' ? '?' : status.charAt(0).toUpperCase()}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
