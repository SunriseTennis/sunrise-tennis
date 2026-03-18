'use client'

import { useState } from 'react'
import { updatePlayerDetails } from '../../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, X } from 'lucide-react'

export function ParentPlayerEditForm({
  player,
}: {
  player: {
    id: string
    first_name: string
    last_name: string
    dob: string | null
    medical_notes: string | null
    media_consent: boolean | null
  }
}) {
  const [open, setOpen] = useState(false)
  const updateWithId = updatePlayerDetails.bind(null, player.id)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Pencil className="size-3" />
        Edit
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card p-6 shadow-elevated animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Edit Player Details</h2>
          <button
            onClick={() => setOpen(false)}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={async (formData) => {
          await updateWithId(formData)
          setOpen(false)
        }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" name="first_name" type="text" required defaultValue={player.first_name} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" type="text" required defaultValue={player.last_name} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="dob">Date of birth</Label>
              <Input id="dob" name="dob" type="date" defaultValue={player.dob ?? ''} className="mt-1" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                id="media_consent"
                name="media_consent"
                type="checkbox"
                defaultChecked={player.media_consent ?? false}
                className="size-4 rounded border-border text-primary focus:ring-primary"
              />
              <Label htmlFor="media_consent" className="cursor-pointer">
                Allow photos and videos
              </Label>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="medical_notes">Medical notes</Label>
              <Textarea id="medical_notes" name="medical_notes" rows={2} defaultValue={player.medical_notes ?? ''} placeholder="Allergies, injuries, conditions..." className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
