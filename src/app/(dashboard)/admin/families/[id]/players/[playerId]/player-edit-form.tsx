'use client'

import { updatePlayer } from '../../../../actions'
import type { Database } from '@/lib/supabase/types'

type Player = Database['public']['Tables']['players']['Row']

const ballColors = ['red', 'orange', 'green', 'yellow', 'competitive']

export function PlayerEditForm({ player, familyId }: { player: Player; familyId: string }) {
  const updateWithIds = updatePlayer.bind(null, player.id, familyId)

  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold text-gray-900">
        Edit Player
      </summary>
      <form action={updateWithIds} className="space-y-4 px-6 pb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">First name</label>
            <input id="first_name" name="first_name" type="text" required defaultValue={player.first_name} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">Last name</label>
            <input id="last_name" name="last_name" type="text" required defaultValue={player.last_name} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="dob" className="block text-sm font-medium text-gray-700">Date of birth</label>
            <input id="dob" name="dob" type="date" defaultValue={player.dob ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="ball_color" className="block text-sm font-medium text-gray-700">Ball colour</label>
            <select id="ball_color" name="ball_color" defaultValue={player.ball_color ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="">Select...</option>
              {ballColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="level" className="block text-sm font-medium text-gray-700">Level</label>
            <select id="level" name="level" defaultValue={player.level ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="">Select...</option>
              {ballColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="current_focus" className="block text-sm font-medium text-gray-700">Current focus (comma-separated)</label>
            <input id="current_focus" name="current_focus" type="text" defaultValue={player.current_focus?.join(', ') ?? ''} placeholder="e.g. forehand, movement, serve" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="short_term_goal" className="block text-sm font-medium text-gray-700">Short-term goal</label>
            <input id="short_term_goal" name="short_term_goal" type="text" defaultValue={player.short_term_goal ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="long_term_goal" className="block text-sm font-medium text-gray-700">Long-term goal</label>
            <input id="long_term_goal" name="long_term_goal" type="text" defaultValue={player.long_term_goal ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="medical_notes" className="block text-sm font-medium text-gray-700">Medical notes</label>
            <textarea id="medical_notes" name="medical_notes" rows={2} defaultValue={player.medical_notes ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
        </div>
        <button type="submit" className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
          Save changes
        </button>
      </form>
    </details>
  )
}
