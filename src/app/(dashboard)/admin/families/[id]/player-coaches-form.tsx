'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { setPlayerAllowedCoaches } from '../../privates/actions'

interface Player {
  id: string
  first_name: string
  last_name: string
}

interface Coach {
  id: string
  name: string
}

interface AllowedEntry {
  player_id: string
  coach_id: string
  auto_approve: boolean
}

interface Props {
  players: Player[]
  coaches: Coach[]
  allowedCoaches: AllowedEntry[]
}

export function PlayerCoachesForm({ players, coaches, allowedCoaches }: Props) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-foreground">Private Lesson Coaches</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set which coaches each player can book private lessons with. Leave empty for no restrictions.
        </p>

        <div className="mt-4 space-y-4">
          {players.map((player) => {
            const playerAllowed = allowedCoaches.filter(a => a.player_id === player.id)
            return (
              <PlayerCoachRow
                key={player.id}
                player={player}
                coaches={coaches}
                allowed={playerAllowed}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function PlayerCoachRow({
  player,
  coaches,
  allowed,
}: {
  player: Player
  coaches: Coach[]
  allowed: AllowedEntry[]
}) {
  const allowedIds = new Set(allowed.map(a => a.coach_id))
  const autoApproveIds = new Set(allowed.filter(a => a.auto_approve).map(a => a.coach_id))

  return (
    <form action={setPlayerAllowedCoaches} className="rounded-lg border border-border p-3">
      <input type="hidden" name="player_id" value={player.id} />

      <p className="text-sm font-medium text-foreground">
        {player.first_name} {player.last_name}
      </p>

      <div className="mt-2 space-y-1.5">
        {coaches.map((coach) => (
          <div key={coach.id} className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="coach_ids"
                value={coach.id}
                defaultChecked={allowedIds.size === 0 || allowedIds.has(coach.id)}
                className="size-3.5 rounded border-border"
              />
              {coach.name}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="auto_approve"
                value={coach.id}
                defaultChecked={autoApproveIds.has(coach.id)}
                className="size-3 rounded border-border"
              />
              Auto-approve
            </label>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {allowedIds.size === 0
          ? 'No restrictions — can book with any coach'
          : `Restricted to ${allowedIds.size} coach${allowedIds.size > 1 ? 'es' : ''}`}
      </p>

      <Button type="submit" size="sm" variant="outline" className="mt-2 h-7 text-xs">
        Save
      </Button>
    </form>
  )
}
