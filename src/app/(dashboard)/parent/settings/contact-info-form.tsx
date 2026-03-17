'use client'

import { updateContactInfo } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export function ContactInfoForm({
  primaryContact,
  secondaryContact,
  address,
}: {
  primaryContact: { name?: string; phone?: string; email?: string } | null
  secondaryContact: { name?: string; phone?: string; email?: string } | null
  address: string | null
}) {
  return (
    <form action={updateContactInfo}>
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-foreground">Contact Information</h2>

          <div className="mt-4">
            <h3 className="text-sm font-medium text-muted-foreground">Primary Contact</h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="contact_name" className="text-xs">Name</Label>
                <Input id="contact_name" name="contact_name" type="text" required defaultValue={primaryContact?.name ?? ''} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="contact_phone" className="text-xs">Phone</Label>
                <Input id="contact_phone" name="contact_phone" type="tel" defaultValue={primaryContact?.phone ?? ''} className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="contact_email" className="text-xs">Email</Label>
                <Input id="contact_email" name="contact_email" type="email" defaultValue={primaryContact?.email ?? ''} className="mt-1" />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground">Secondary Contact (optional)</h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="secondary_name" className="text-xs">Name</Label>
                <Input id="secondary_name" name="secondary_name" type="text" defaultValue={secondaryContact?.name ?? ''} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="secondary_phone" className="text-xs">Phone</Label>
                <Input id="secondary_phone" name="secondary_phone" type="tel" defaultValue={secondaryContact?.phone ?? ''} className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="secondary_email" className="text-xs">Email</Label>
                <Input id="secondary_email" name="secondary_email" type="email" defaultValue={secondaryContact?.email ?? ''} className="mt-1" />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Label htmlFor="address" className="text-xs">Address</Label>
            <Input id="address" name="address" type="text" defaultValue={address ?? ''} className="mt-1" />
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="submit">Save Changes</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
