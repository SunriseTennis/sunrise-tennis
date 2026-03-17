'use client'

import { addTeamMember } from '../actions'

interface Props {
  teamId: string
  players: { id: string; first_name: string; last_name: string; ball_color: string | null }[]
}

export function AddMemberForm({ teamId, players }: Props) {
  const action = addTeamMember.bind(null, teamId)

  if (players.length === 0) {
    return <p className="text-xs text-gray-500">All active players are already on this team.</p>
  }

  return (
    <form action={action} className="flex items-end gap-3">
      <div className="flex-1">
        <label htmlFor="player_id" className="block text-xs font-medium text-gray-700">Add Player</label>
        <select
          id="player_id"
          name="player_id"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
        <label htmlFor="role" className="block text-xs font-medium text-gray-700">Role</label>
        <select
          id="role"
          name="role"
          className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="member">Member</option>
          <option value="captain">Captain</option>
          <option value="reserve">Reserve</option>
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-gray-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-900"
      >
        Add
      </button>
    </form>
  )
}
