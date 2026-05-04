'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { createFamily } from '../../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function NewFamilyForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-danger/20 bg-danger-light p-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <form action={createFamily}>
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <h3 className="text-sm font-semibold text-foreground">Primary Contact</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Family name is auto-derived from the primary contact&apos;s last name.
                </p>
              </div>

              <div>
                <Label htmlFor="contact_first_name">First name *</Label>
                <Input id="contact_first_name" name="contact_first_name" type="text" required autoComplete="given-name" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="contact_last_name">Last name *</Label>
                <Input id="contact_last_name" name="contact_last_name" type="text" required autoComplete="family-name" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="contact_phone">Phone</Label>
                <Input id="contact_phone" name="contact_phone" type="tel" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="contact_email">Email</Label>
                <Input id="contact_email" name="contact_email" type="email" className="mt-1" />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" type="text" className="mt-1" />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="referred_by">Referred by</Label>
                <Input id="referred_by" name="referred_by" type="text" className="mt-1" />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button type="submit">Create family</Button>
              <Button variant="outline" asChild>
                <Link href="/admin/families">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </>
  )
}

export default function NewFamilyPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Add New Family</h1>
      <p className="mt-1 text-sm text-muted-foreground">Create a new family account. Add players after.</p>
      <div className="mt-6">
        <Suspense>
          <NewFamilyForm />
        </Suspense>
      </div>
    </div>
  )
}
