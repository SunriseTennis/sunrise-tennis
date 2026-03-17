'use client'

import { addTeamMember } from '../actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const selectClass = 'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

interface Props {
  teamId: string
  players: { id: string; first_name: string; last_name: string; ball_color: string | null }[]
}

export function AddMemberForm({ teamId, players }: Props) {
  const action = addTeamMember.bind(null, teamId)

  if (players.length === 0) {
    return <p className="text-xs text-muted-foreground">All active players are already on this team.</p>
  }

  return (
    <form action={action} className="flex items-end gap-3">
      <div className="flex-1">
        <Label htmlFor="player_id" className="text-xs">Add Player</Label>
        <select
          id="player_id"
          name="player_id"
          required
          className={`mt-1 block w-full ${selectClass} py-1.5`}
        >
          <option value="">Select player...</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name} {p.ball_color ? `(${p.ball_color})` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="role" className="text-xs">Role</Label>
        <select
          id="role"
          name="role"
          className={`mt-1 ${selectClass} py-1.5`}
        >
          <option value="member">Member</option>
          <option value="captain">Captain</option>
          <option value="reserve">Reserve</option>
        </select>
      </div>
      <Button type="submit" size="sm">
        Add
      </Button>
    </form>
  )
}
