'use client'

import { useState } from 'react'
import { createPlayer } from '../../../admin/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'
import { ConsentToggle, CONSENT_LABELS } from '@/components/consent-toggle'

const BALL_COLORS = ['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite', 'competitive']

const CLASSIFICATIONS: { value: string; label: string }[] = [
  { value: 'blue', label: 'Blue' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'green', label: 'Green' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'advanced', label: 'Advanced (UTR 3.5+)' },
  { value: 'elite', label: 'Elite (UTR 7.5+)' },
]

export function AddPlayerForm({ familyId }: { familyId: string }) {
  const createWithFamily = createPlayer.bind(null, familyId)
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set())

  function toggle(value: string) {
    setSelectedClasses((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium text-primary hover:text-primary/80">
        + Add player
      </summary>
      <form action={createWithFamily} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="classifications" value={[...selectedClasses].join(',')} />

        <div>
          <Label htmlFor="first_name">First name *</Label>
          <Input id="first_name" name="first_name" type="text" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="last_name">Last name *</Label>
          <Input id="last_name" name="last_name" type="text" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" name="dob" type="date" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="gender">Gender</Label>
          <select id="gender" name="gender" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non_binary">Non-binary</option>
          </select>
        </div>
        <div>
          <Label htmlFor="ball_color">Ball colour</Label>
          <select id="ball_color" name="ball_color" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="">Select...</option>
            {BALL_COLORS.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="level">Level</Label>
          <select id="level" name="level" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="">Select...</option>
            {BALL_COLORS.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Label>Classifications</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick all that apply. Players can hold multiple (e.g. yellow + advanced).
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CLASSIFICATIONS.map((c) => {
              const selected = selectedClasses.has(c.value)
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggle(c.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/30',
                  )}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <Label htmlFor="track">Track</Label>
          <select id="track" name="track" defaultValue="participation" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="participation">Participation</option>
            <option value="performance">Performance</option>
          </select>
        </div>
        <div className="sm:col-span-2 space-y-2 pt-2">
          <Label className="text-xs font-semibold">Media consent</Label>
          <div className="space-y-1.5">
            <ConsentToggle
              id="add_media_consent_coaching"
              name="media_consent_coaching"
              defaultChecked={false}
              label={CONSENT_LABELS.coaching.label}
              hint={CONSENT_LABELS.coaching.hint}
            />
            <ConsentToggle
              id="add_media_consent_family"
              name="media_consent_family"
              defaultChecked={false}
              label={CONSENT_LABELS.family.label}
              hint={CONSENT_LABELS.family.hint}
            />
            <ConsentToggle
              id="add_media_consent_social"
              name="media_consent_social"
              defaultChecked={false}
              label={CONSENT_LABELS.social.label}
              hint={CONSENT_LABELS.social.hint}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="medical_notes">Medical notes</Label>
          <Textarea id="medical_notes" name="medical_notes" rows={2} className="mt-1" placeholder="Allergies, injuries, conditions..." />
          <p className="mt-1 text-xs text-muted-foreground">
            Medical information is shared voluntarily for player safety during coaching. It is encrypted at rest and accessible only to authorised coaches and family members.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="physical_notes">Physical notes</Label>
          <Textarea id="physical_notes" name="physical_notes" rows={2} className="mt-1" placeholder="Mobility limitations, dominant hand, height/build context..." />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit">Add player</Button>
        </div>
      </form>
    </details>
  )
}
