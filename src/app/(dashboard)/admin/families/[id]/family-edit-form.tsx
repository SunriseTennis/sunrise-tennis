'use client'

import { updateFamily } from '../../../admin/actions'
import type { Database } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Family = Database['public']['Tables']['families']['Row']

export function FamilyEditForm({ family }: { family: Family }) {
  const contact = family.primary_contact as { name?: string; phone?: string; email?: string } | null
  const updateWithId = updateFamily.bind(null, family.id)

  return (
    <details className="rounded-xl border border-border bg-card shadow-sm">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold text-foreground">
        Edit Family Details
      </summary>
      <form action={updateWithId} className="space-y-4 px-6 pb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="family_name">Family name</Label>
            <Input id="family_name" name="family_name" type="text" required defaultValue={family.family_name} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <select id="status" name="status" defaultValue={family.status} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="lead">Lead</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <Label htmlFor="contact_name">Contact name</Label>
            <Input id="contact_name" name="contact_name" type="text" required defaultValue={contact?.name ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="contact_phone">Phone</Label>
            <Input id="contact_phone" name="contact_phone" type="tel" defaultValue={contact?.phone ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="contact_email">Email</Label>
            <Input id="contact_email" name="contact_email" type="email" defaultValue={contact?.email ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" type="text" defaultValue={family.address ?? ''} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={family.notes ?? ''} className="mt-1" />
          </div>
        </div>
        <Button type="submit">Save changes</Button>
      </form>
    </details>
  )
}
