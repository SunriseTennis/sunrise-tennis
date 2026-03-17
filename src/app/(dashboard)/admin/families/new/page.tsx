'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createFamily } from '../../actions'

function NewFamilyForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form action={createFamily} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="family_name" className="block text-sm font-medium text-gray-700">Family name *</label>
            <input id="family_name" name="family_name" type="text" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div className="sm:col-span-2">
            <h3 className="text-sm font-semibold text-gray-900">Primary Contact</h3>
          </div>

          <div>
            <label htmlFor="contact_name" className="block text-sm font-medium text-gray-700">Contact name *</label>
            <input id="contact_name" name="contact_name" type="text" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div>
            <label htmlFor="contact_phone" className="block text-sm font-medium text-gray-700">Phone</label>
            <input id="contact_phone" name="contact_phone" type="tel" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div>
            <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700">Email</label>
            <input id="contact_email" name="contact_email" type="email" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
            <input id="address" name="address" type="text" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="referred_by" className="block text-sm font-medium text-gray-700">Referred by</label>
            <input id="referred_by" name="referred_by" type="text" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
            Create family
          </button>
          <Link href="/admin/families" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </Link>
        </div>
      </form>
    </>
  )
}

export default function NewFamilyPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Add New Family</h1>
      <p className="mt-1 text-sm text-gray-600">Create a new family account. Add players after.</p>
      <div className="mt-6">
        <Suspense>
          <NewFamilyForm />
        </Suspense>
      </div>
    </div>
  )
}
