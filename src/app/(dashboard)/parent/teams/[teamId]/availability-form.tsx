'use client'

interface AvailabilityRecord {
  id: string
  player_id: string
  match_date: string
  status: string
  note: string | null
}

interface Props {
  players: { id: string; first_name: string; last_name: string }[]
  pendingAvailability: AvailabilityRecord[]
  action: (formData: FormData) => Promise<void>
}

export function AvailabilityForm({ players, pendingAvailability, action }: Props) {
  // Group by player and date
  const byPlayer = new Map<string, AvailabilityRecord[]>()
  pendingAvailability.forEach((a) => {
    const existing = byPlayer.get(a.player_id) ?? []
    existing.push(a)
    byPlayer.set(a.player_id, existing)
  })

  return (
    <form action={action} className="space-y-6">
      {players.map((player) => {
        const checks = byPlayer.get(player.id) ?? []
        if (checks.length === 0) return null

        return (
          <div key={player.id}>
            <h3 className="text-sm font-semibold text-gray-900">
              {player.first_name} {player.last_name}
            </h3>
            <div className="mt-2 space-y-3">
              {checks.map((check) => {
                const dateKey = check.match_date.replace(/-/g, '_')
                return (
                  <div key={check.id} className="rounded-md border border-gray-200 bg-white p-3">
                    <p className="text-sm font-medium text-gray-700">
                      {new Date(check.match_date + 'T00:00:00').toLocaleDateString('en-AU', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <div className="mt-2 flex gap-4">
                      {['available', 'unavailable', 'maybe'].map((status) => (
                        <label key={status} className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`status_${player.id}_${dateKey}`}
                            value={status}
                            defaultChecked={check.status === status}
                            required
                            className="text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-sm capitalize text-gray-700">{status}</span>
                        </label>
                      ))}
                    </div>
                    <input
                      name={`note_${player.id}_${dateKey}`}
                      type="text"
                      placeholder="Note (optional)"
                      defaultValue={check.note ?? ''}
                      className="mt-2 block w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <button
        type="submit"
        className="rounded-md bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        Submit Availability
      </button>
    </form>
  )
}
