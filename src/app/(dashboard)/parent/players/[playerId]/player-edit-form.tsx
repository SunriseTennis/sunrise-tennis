'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { updatePlayerDetails } from '../../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, X } from 'lucide-react'
import { ConsentToggle, CONSENT_LABELS } from '@/components/consent-toggle'

export function ParentPlayerEditForm({
  player,
}: {
  player: {
    id: string
    first_name: string
    last_name: string
    dob: string | null
    gender: string | null
    medical_notes: string | null
    school: string | null
    media_consent_coaching: boolean
    media_consent_social: boolean
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

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-popover p-6 shadow-elevated animate-slide-up">
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
            <div>
              <Label htmlFor="gender">Gender</Label>
              <select
                id="gender"
                name="gender"
                defaultValue={player.gender ?? ''}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-Binary</option>
              </select>
            </div>
            <div className="sm:col-span-2 space-y-2 pt-2">
              <Label className="text-xs font-semibold">Media consent</Label>
              <div className="space-y-2">
                <ConsentToggle
                  id="edit_media_consent_coaching"
                  name="media_consent_coaching"
                  defaultChecked={player.media_consent_coaching}
                  label={CONSENT_LABELS.coaching.label}
                  hint={CONSENT_LABELS.coaching.hint}
                />
                <ConsentToggle
                  id="edit_media_consent_social"
                  name="media_consent_social"
                  defaultChecked={player.media_consent_social}
                  label={CONSENT_LABELS.social.label}
                  hint={CONSENT_LABELS.social.hint}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="school">School <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="school" name="school" type="text" defaultValue={player.school ?? ''} placeholder="e.g. McAuley Community School" className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="medical_notes">Medical notes</Label>
              <Textarea id="medical_notes" name="medical_notes" rows={2} defaultValue={player.medical_notes ?? ''} placeholder="Allergies, injuries, conditions..." className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">
                Medical information is shared voluntarily for player safety during coaching. It is encrypted at rest and accessible only to authorised coaches and family members.
              </p>
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

  return createPortal(modal, document.body)
}
