'use client'

import { updateFamily } from '../../../admin/actions'
import type { Database } from '@/lib/supabase/types'

type Family = Database['public']['Tables']['families']['Row']

export function FamilyEditForm({ family }: { family: Family }) {
  const contact = family.primary_contact as { name?: string; phone?: string; email?: string } | null
  const updateWithId = updateFamily.bind(null, family.id)

  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold text-gray-900">
        Edit Family Details
      </summary>
      <form action={updateWithId} className="space-y-4 px-6 pb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="family_name" className="block text-sm font-medium text-gray-700">Family name</label>
            <input id="family_name" name="family_name" type="text" required defaultValue={family.family_name} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
            <select id="status" name="status" defaultValue={family.status} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="lead">Lead</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label htmlFor="contact_name" className="block text-sm font-medium text-gray-700">Contact name</label>
            <input id="contact_name" name="contact_name" type="text" required defaultValue={contact?.name ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="contact_phone" className="block text-sm font-medium text-gray-700">Phone</label>
            <input id="contact_phone" name="contact_phone" type="tel" defaultValue={contact?.phone ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700">Email</label>
            <input id="contact_email" name="contact_email" type="email" defaultValue={contact?.email ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
            <input id="address" name="address" type="text" defaultValue={family.address ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea id="notes" name="notes" rows={3} defaultValue={family.notes ?? ''} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
        </div>
        <button type="submit" className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
          Save changes
        </button>
      </form>
    </details>
  )
}
