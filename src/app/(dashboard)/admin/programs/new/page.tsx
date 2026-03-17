'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createProgram } from '../../actions'

const DAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

function NewProgramForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form action={createProgram} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Program name *</label>
            <input id="name" name="name" type="text" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">Type *</label>
            <select id="type" name="type" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="group">Group</option>
              <option value="squad">Squad</option>
              <option value="school">School</option>
              <option value="competition">Competition</option>
            </select>
          </div>

          <div>
            <label htmlFor="level" className="block text-sm font-medium text-gray-700">Level *</label>
            <select id="level" name="level" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="red">Red ball</option>
              <option value="orange">Orange ball</option>
              <option value="green">Green ball</option>
              <option value="yellow">Yellow ball</option>
              <option value="competitive">Competitive</option>
            </select>
          </div>

          <div>
            <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700">Day</label>
            <select id="day_of_week" name="day_of_week" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="">Select...</option>
              {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="max_capacity" className="block text-sm font-medium text-gray-700">Max capacity</label>
            <input id="max_capacity" name="max_capacity" type="number" min="1" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div>
            <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">Start time</label>
            <input id="start_time" name="start_time" type="time" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div>
            <label htmlFor="end_time" className="block text-sm font-medium text-gray-700">End time</label>
            <input id="end_time" name="end_time" type="time" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div>
            <label htmlFor="per_session_dollars" className="block text-sm font-medium text-gray-700">Per session ($)</label>
            <input id="per_session_dollars" name="per_session_dollars" type="number" step="0.01" min="0" placeholder="e.g. 25.00" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div>
            <label htmlFor="term_fee_dollars" className="block text-sm font-medium text-gray-700">Term fee ($)</label>
            <input id="term_fee_dollars" name="term_fee_dollars" type="number" step="0.01" min="0" placeholder="e.g. 200.00" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
            <textarea id="description" name="description" rows={3} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
            Create program
          </button>
          <Link href="/admin/programs" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </Link>
        </div>
      </form>
    </>
  )
}

export default function NewProgramPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Add New Program</h1>
      <p className="mt-1 text-sm text-gray-600">Create a new group program, squad, or school program.</p>
      <div className="mt-6">
        <Suspense>
          <NewProgramForm />
        </Suspense>
      </div>
    </div>
  )
}
