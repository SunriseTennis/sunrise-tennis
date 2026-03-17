'use client'

import { updateProgram } from '../../../admin/actions'
import type { Database } from '@/lib/supabase/types'

type Program = Database['public']['Tables']['programs']['Row']

const DAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

export function ProgramEditForm({ program }: { program: Program }) {
  const updateWithId = updateProgram.bind(null, program.id)

  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold text-gray-900">
        Edit Program
      </summary>
      <form action={updateWithId} className="space-y-4 px-6 pb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
            <input id="name" name="name" type="text" required defaultValue={program.name} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">Type</label>
            <select id="type" name="type" required defaultValue={program.type} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="group">Group</option>
              <option value="squad">Squad</option>
              <option value="school">School</option>
              <option value="competition">Competition</option>
            </select>
          </div>
          <div>
            <label htmlFor="level" className="block text-sm font-medium text-gray-700">Level</label>
            <select id="level" name="level" required defaultValue={program.level} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="red">Red ball</option>
              <option value="orange">Orange ball</option>
              <option value="green">Green ball</option>
              <option value="yellow">Yellow ball</option>
              <option value="competitive">Competitive</option>
            </select>
          </div>
          <div>
            <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700">Day</label>
            <select id="day_of_week" name="day_of_week" defaultValue={program.day_of_week?.toString() ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="">Select...</option>
              {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
            <select id="status" name="status" defaultValue={program.status} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">Start time</label>
            <input id="start_time" name="start_time" type="time" defaultValue={program.start_time ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="end_time" className="block text-sm font-medium text-gray-700">End time</label>
            <input id="end_time" name="end_time" type="time" defaultValue={program.end_time ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="max_capacity" className="block text-sm font-medium text-gray-700">Max capacity</label>
            <input id="max_capacity" name="max_capacity" type="number" min="1" defaultValue={program.max_capacity ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="per_session_dollars" className="block text-sm font-medium text-gray-700">Per session ($)</label>
            <input id="per_session_dollars" name="per_session_dollars" type="number" step="0.01" min="0" defaultValue={program.per_session_cents ? (program.per_session_cents / 100).toFixed(2) : ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="term_fee_dollars" className="block text-sm font-medium text-gray-700">Term fee ($)</label>
            <input id="term_fee_dollars" name="term_fee_dollars" type="number" step="0.01" min="0" defaultValue={program.term_fee_cents ? (program.term_fee_cents / 100).toFixed(2) : ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
            <textarea id="description" name="description" rows={3} defaultValue={program.description ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
        </div>
        <button type="submit" className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
          Save changes
        </button>
      </form>
    </details>
  )
}
