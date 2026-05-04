'use client'

import { updateContactInfo } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User } from 'lucide-react'
import { splitFullName } from '@/lib/utils/name'

/**
 * Plan 17 follow-up — primary + secondary contact split into first + last.
 * The primary contact's surname becomes families.family_name (handled in
 * `updateContactInfo` action). Pre-Plan-17 stored full names are split for
 * display via splitFullName().
 */
export function ContactInfoForm({
  primaryContact,
  secondaryContact,
}: {
  primaryContact: { name?: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null
  secondaryContact: { name?: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null
}) {
  const primarySplit = splitFullName(primaryContact?.name)
  const primaryFirst = primaryContact?.first_name ?? primarySplit.first
  const primaryLast = primaryContact?.last_name ?? primarySplit.last

  const secondarySplit = splitFullName(secondaryContact?.name)
  const secondaryFirst = secondaryContact?.first_name ?? secondarySplit.first
  const secondaryLast = secondaryContact?.last_name ?? secondarySplit.last

  return (
    <form action={updateContactInfo}>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
              <User className="size-3.5 text-primary" />
            </div>
            Contact Information
          </h2>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary Contact</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Your last name is used as your family name across the platform.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="contact_first_name" className="text-xs">First name</Label>
                <Input id="contact_first_name" name="contact_first_name" type="text" required defaultValue={primaryFirst} autoComplete="given-name" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="contact_last_name" className="text-xs">Last name</Label>
                <Input id="contact_last_name" name="contact_last_name" type="text" required defaultValue={primaryLast} autoComplete="family-name" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="contact_phone" className="text-xs">Phone</Label>
                <Input id="contact_phone" name="contact_phone" type="tel" defaultValue={primaryContact?.phone ?? ''} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="contact_email" className="text-xs">Email</Label>
                <Input id="contact_email" name="contact_email" type="email" defaultValue={primaryContact?.email ?? ''} className="mt-1" />
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Secondary Contact (optional)</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="secondary_first_name" className="text-xs">First name</Label>
                <Input id="secondary_first_name" name="secondary_first_name" type="text" defaultValue={secondaryFirst} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="secondary_last_name" className="text-xs">Last name</Label>
                <Input id="secondary_last_name" name="secondary_last_name" type="text" defaultValue={secondaryLast} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="secondary_phone" className="text-xs">Phone</Label>
                <Input id="secondary_phone" name="secondary_phone" type="tel" defaultValue={secondaryContact?.phone ?? ''} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="secondary_email" className="text-xs">Email</Label>
                <Input id="secondary_email" name="secondary_email" type="email" defaultValue={secondaryContact?.email ?? ''} className="mt-1" />
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-border/40 pt-4">
            <Button type="submit" size="sm">Save Changes</Button>
          </div>
        </div>
      </div>
    </form>
  )
}
