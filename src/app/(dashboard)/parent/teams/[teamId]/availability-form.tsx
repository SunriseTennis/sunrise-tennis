'use client'

import { Button } from '@/components/ui/button'

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
            <h3 className="text-sm font-semibold text-foreground">
              {player.first_name} {player.last_name}
            </h3>
            <div className="mt-2 space-y-3">
              {checks.map((check) => {
                const dateKey = check.match_date.replace(/-/g, '_')
                return (
                  <div key={check.id} className="rounded-md border border-border bg-card p-3">
                    <p className="text-sm font-medium text-muted-foreground">
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
                            className="text-primary focus:ring-primary"
                          />
                          <span className="text-sm capitalize text-muted-foreground">{status}</span>
                        </label>
                      ))}
                    </div>
                    <input
                      name={`note_${player.id}_${dateKey}`}
                      type="text"
                      placeholder="Note (optional)"
                      defaultValue={check.note ?? ''}
                      className="mt-2 block w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <Button type="submit">Submit Availability</Button>
    </form>
  )
}
