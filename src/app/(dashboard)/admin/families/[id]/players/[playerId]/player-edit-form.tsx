'use client'

import { useState } from 'react'
import { updatePlayer } from '../../../../actions'
import type { Database } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'
import { ConsentToggle, CONSENT_LABELS } from '@/components/consent-toggle'

type Player = Database['public']['Tables']['players']['Row']

const ballColors = ['blue', 'red', 'orange', 'green', 'yellow']
const ALL_CLASSIFICATIONS = ['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'] as const

type Classification = (typeof ALL_CLASSIFICATIONS)[number]

const CLASS_PILL: Record<Classification, { active: string; inactive: string }> = {
  blue:     { active: 'bg-ball-blue text-white border-ball-blue',       inactive: 'bg-ball-blue/10 text-ball-blue border-ball-blue/30' },
  red:      { active: 'bg-ball-red text-white border-ball-red',         inactive: 'bg-ball-red/10 text-ball-red border-ball-red/30' },
  orange:   { active: 'bg-ball-orange text-white border-ball-orange',   inactive: 'bg-ball-orange/10 text-ball-orange border-ball-orange/30' },
  green:    { active: 'bg-ball-green text-white border-ball-green',     inactive: 'bg-ball-green/10 text-ball-green border-ball-green/30' },
  yellow:   { active: 'bg-ball-yellow text-black border-ball-yellow',   inactive: 'bg-ball-yellow/10 text-yellow-700 border-ball-yellow/30' },
  advanced: { active: 'bg-primary text-white border-primary',           inactive: 'bg-primary/10 text-primary border-primary/30' },
  elite:    { active: 'bg-foreground text-background border-foreground', inactive: 'bg-foreground/10 text-foreground border-foreground/30' },
}

export function PlayerEditForm({ player, familyId }: { player: Player; familyId: string }) {
  const updateWithIds = updatePlayer.bind(null, player.id, familyId)

  const initialClasses = (player.classifications as string[] | null) ?? []
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set(initialClasses))

  function toggleClass(c: Classification) {
    setSelectedClasses(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  return (
    <details className="rounded-xl border border-border bg-card shadow-sm">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold text-foreground">
        Edit Player
      </summary>
      <form action={updateWithIds} className="space-y-4 px-6 pb-6">
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
            <Label htmlFor="preferred_name">Preferred name</Label>
            <Input id="preferred_name" name="preferred_name" type="text" defaultValue={player.preferred_name ?? ''} placeholder="If different from first name" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="gender">Gender</Label>
            <select id="gender" name="gender" defaultValue={player.gender ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non_binary">Non-binary</option>
            </select>
          </div>
          <div>
            <Label htmlFor="dob">Date of birth</Label>
            <Input id="dob" name="dob" type="date" defaultValue={player.dob ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <select id="status" name="status" defaultValue={player.status ?? 'active'} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ball_color">Ball colour (display)</Label>
            <select id="ball_color" name="ball_color" defaultValue={player.ball_color ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select...</option>
              {ballColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Display label for cards/calendar. Eligibility is driven by classifications below.</p>
          </div>
          <div>
            <Label htmlFor="level">Level (legacy)</Label>
            <select id="level" name="level" defaultValue={player.level ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select...</option>
              {ballColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="track">Track <span className="text-xs text-muted-foreground">(admin-only)</span></Label>
            <select id="track" name="track" defaultValue={player.track ?? 'participation'} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="participation">Participation (no Thursday squads)</option>
              <option value="performance">Performance (Thursday squads visible)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Classifications</Label>
            <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
              Drives program eligibility. Multiple allowed. Advanced ≈ UTR 4.5+, Elite ≈ UTR 7.5+.
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_CLASSIFICATIONS.map((c) => {
                const active = selectedClasses.has(c)
                const style = CLASS_PILL[c]
                return (
                  <button
                    type="button"
                    key={c}
                    onClick={() => toggleClass(c)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-all',
                      active ? style.active : style.inactive,
                    )}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
            <input type="hidden" name="classifications" value={[...selectedClasses].join(',')} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="current_focus">Current focus (comma-separated)</Label>
            <Input id="current_focus" name="current_focus" type="text" defaultValue={player.current_focus?.join(', ') ?? ''} placeholder="e.g. forehand, movement, serve" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="short_term_goal">Short-term goal</Label>
            <Input id="short_term_goal" name="short_term_goal" type="text" defaultValue={player.short_term_goal ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="long_term_goal">Long-term goal</Label>
            <Input id="long_term_goal" name="long_term_goal" type="text" defaultValue={player.long_term_goal ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="comp_interest">Competition interest</Label>
            <select id="comp_interest" name="comp_interest" defaultValue={player.comp_interest ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="future">Future</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="medical_notes">Medical notes</Label>
            <Textarea id="medical_notes" name="medical_notes" rows={2} defaultValue={player.medical_notes ?? ''} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="physical_notes">Physical notes</Label>
            <Textarea id="physical_notes" name="physical_notes" rows={2} defaultValue={player.physical_notes ?? ''} className="mt-1" />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label className="text-xs font-semibold">Media consent</Label>
            <div className="space-y-1.5">
              <ConsentToggle
                id="admin_edit_media_consent_coaching"
                name="media_consent_coaching"
                defaultChecked={player.media_consent_coaching ?? false}
                label={CONSENT_LABELS.coaching.label}
                hint={CONSENT_LABELS.coaching.hint}
              />
              <ConsentToggle
                id="admin_edit_media_consent_family"
                name="media_consent_family"
                defaultChecked={player.media_consent_family ?? false}
                label={CONSENT_LABELS.family.label}
                hint={CONSENT_LABELS.family.hint}
              />
              <ConsentToggle
                id="admin_edit_media_consent_social"
                name="media_consent_social"
                defaultChecked={player.media_consent_social ?? false}
                label={CONSENT_LABELS.social.label}
                hint={CONSENT_LABELS.social.hint}
              />
            </div>
          </div>
        </div>
        <Button type="submit">Save changes</Button>
      </form>
    </details>
  )
}
