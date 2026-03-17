'use client'

import { createPlayer } from '../../../admin/actions'

const ballColors = ['red', 'orange', 'green', 'yellow', 'competitive']

export function AddPlayerForm({ familyId }: { familyId: string }) {
  const createWithFamily = createPlayer.bind(null, familyId)

  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium text-orange-600 hover:text-orange-500">
        + Add player
      </summary>
      <form action={createWithFamily} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">First name *</label>
          <input id="first_name" name="first_name" type="text" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
        </div>
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">Last name *</label>
          <input id="last_name" name="last_name" type="text" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
        </div>
        <div>
          <label htmlFor="dob" className="block text-sm font-medium text-gray-700">Date of birth</label>
          <input id="dob" name="dob" type="date" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
        </div>
        <div>
          <label htmlFor="ball_color" className="block text-sm font-medium text-gray-700">Ball colour</label>
          <select id="ball_color" name="ball_color" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
            <option value="">Select...</option>
            {ballColors.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="level" className="block text-sm font-medium text-gray-700">Level</label>
          <select id="level" name="level" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
            <option value="">Select...</option>
            {ballColors.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="medical_notes" className="block text-sm font-medium text-gray-700">Medical notes</label>
          <textarea id="medical_notes" name="medical_notes" rows={2} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" placeholder="Allergies, injuries, conditions..." />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
            Add player
          </button>
        </div>
      </form>
    </details>
  )
}
