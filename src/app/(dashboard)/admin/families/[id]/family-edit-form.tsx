'use client'

import { updateFamily } from '../../../admin/actions'
import type { Database } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { splitFullName } from '@/lib/utils/name'

type Family = Database['public']['Tables']['families']['Row']

/**
 * Plan 17 follow-up — primary + secondary contact split into first + last.
 * The primary contact's surname becomes families.family_name (handled in
 * the `updateFamily` action). The standalone `family_name` input is gone.
 */
export function FamilyEditForm({ family }: { family: Family }) {
  const contact = family.primary_contact as { name?: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null
  const secondaryContact = family.secondary_contact as { name?: string; first_name?: string; last_name?: string; role?: string; phone?: string; email?: string } | null
  const updateWithId = updateFamily.bind(null, family.id)

  const primarySplit = splitFullName(contact?.name)
  const primaryFirst = contact?.first_name ?? primarySplit.first
  const primaryLast = contact?.last_name ?? primarySplit.last

  const secondarySplit = splitFullName(secondaryContact?.name)
  const secondaryFirst = secondaryContact?.first_name ?? secondarySplit.first
  const secondaryLast = secondaryContact?.last_name ?? secondarySplit.last

  return (
    <details className="rounded-xl border border-border bg-card shadow-sm">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold text-foreground">
        Edit Family Details
      </summary>
      <form action={updateWithId} className="space-y-4 px-6 pb-6">
        <p className="text-xs text-muted-foreground">
          Family name (currently <strong>{family.family_name}</strong>) is auto-derived from the primary contact&apos;s last name.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact_first_name">Primary first name</Label>
            <Input id="contact_first_name" name="contact_first_name" type="text" required defaultValue={primaryFirst} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="contact_last_name">Primary last name</Label>
            <Input id="contact_last_name" name="contact_last_name" type="text" required defaultValue={primaryLast} className="mt-1" />
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
          {/* Secondary contact */}
          <div className="sm:col-span-2">
            <p className="text-sm font-semibold text-foreground">Secondary Contact</p>
          </div>
          <div>
            <Label htmlFor="secondary_first_name">First name</Label>
            <Input id="secondary_first_name" name="secondary_first_name" type="text" defaultValue={secondaryFirst} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="secondary_last_name">Last name</Label>
            <Input id="secondary_last_name" name="secondary_last_name" type="text" defaultValue={secondaryLast} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="secondary_role">Role</Label>
            <Input id="secondary_role" name="secondary_role" type="text" placeholder="e.g. Father, Grandparent" defaultValue={secondaryContact?.role ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="secondary_phone">Phone</Label>
            <Input id="secondary_phone" name="secondary_phone" type="tel" defaultValue={secondaryContact?.phone ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="secondary_email">Email</Label>
            <Input id="secondary_email" name="secondary_email" type="email" defaultValue={secondaryContact?.email ?? ''} className="mt-1" />
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
