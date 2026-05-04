'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'
import { createPlayerFromParent } from '../../actions'
import { ConsentToggle, CONSENT_LABELS } from '@/components/consent-toggle'

const BALL_COLORS = [
  { value: '', label: "I'm not sure" },
  { value: 'blue', label: 'Blue Ball (3-5)' },
  { value: 'red', label: 'Red Ball (5-8)' },
  { value: 'orange', label: 'Orange Ball (8-10)' },
  { value: 'green', label: 'Green Ball (9-12)' },
  { value: 'yellow', label: 'Yellow Ball (10+)' },
]

const CLASSIFICATIONS: { value: string; label: string; hint?: string }[] = [
  { value: 'blue', label: 'Blue' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'green', label: 'Green' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'advanced', label: 'Advanced', hint: 'UTR 3.5+' },
  { value: 'elite', label: 'Elite', hint: 'UTR 7.5+' },
]

export function ParentAddPlayerForm() {
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
    <form action={createPlayerFromParent} className="space-y-4">
      <input type="hidden" name="classifications" value={[...selectedClasses].join(',')} />

      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="first_name">First name *</Label>
            <Input id="first_name" name="first_name" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="last_name">Last name *</Label>
            <Input id="last_name" name="last_name" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="preferred_name">Preferred name</Label>
            <Input id="preferred_name" name="preferred_name" className="mt-1" placeholder="Optional" />
          </div>
          <div>
            <Label htmlFor="dob">Date of birth *</Label>
            <Input id="dob" name="dob" type="date" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="gender">Gender *</Label>
            <select id="gender" name="gender" required className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non_binary">Non-binary</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ball_color">Ball level (best guess)</Label>
            <select id="ball_color" name="ball_color" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              {BALL_COLORS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              We&apos;ll confirm the right level — pick whichever feels closest. New to tennis? Leave blank.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label>Classifications</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick anything that applies. <span className="font-medium">Advanced</span> and <span className="font-medium">Elite</span> open up our higher-level squads — UTR thresholds shown below. Leave them off if you&apos;re unsure.
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
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30',
                    )}
                  >
                    {c.label}
                    {c.hint && <span className="ml-1 text-[10px] opacity-70">{c.hint}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="track">Track</Label>
            <select id="track" name="track" defaultValue="participation" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="participation">Participation (groups + clinics)</option>
              <option value="performance">Performance (squad-level training)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Performance is for kids in or aiming at squad programs. Default is participation — admin can change later.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label htmlFor="school">School <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="school" name="school" type="text" className="mt-1" placeholder="e.g. McAuley Community School" />
            <p className="mt-1 text-xs text-muted-foreground">
              Helps us match school programs and stay coordinated.
            </p>
          </div>
          <div>
            <Label htmlFor="medical_notes">Medical notes</Label>
            <Textarea id="medical_notes" name="medical_notes" rows={2} className="mt-1" placeholder="Allergies, conditions, medications..." />
            <p className="mt-1 text-xs text-muted-foreground">
              Encrypted at rest. Only admin and your child&apos;s coaches can see this.
            </p>
          </div>
          <div>
            <Label htmlFor="physical_notes">Physical notes</Label>
            <Textarea id="physical_notes" name="physical_notes" rows={2} className="mt-1" placeholder="Injuries, mobility limits, dominant hand..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm">
            <p className="font-medium text-foreground">Media consent</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We take photos and short videos during sessions for three different reasons. Pick whichever you&apos;re OK with — leave the rest off. Change any time in Settings.
            </p>
          </div>
          <div className="space-y-2">
            <ConsentToggle
              id="media_consent_coaching"
              name="media_consent_coaching"
              defaultChecked={false}
              label={CONSENT_LABELS.coaching.label}
              hint={CONSENT_LABELS.coaching.hint}
            />
            <ConsentToggle
              id="media_consent_family"
              name="media_consent_family"
              defaultChecked={false}
              label={CONSENT_LABELS.family.label}
              hint={CONSENT_LABELS.family.hint}
            />
            <ConsentToggle
              id="media_consent_social"
              name="media_consent_social"
              defaultChecked={false}
              label={CONSENT_LABELS.social.label}
              hint={CONSENT_LABELS.social.hint}
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full">Add player</Button>
    </form>
  )
}
