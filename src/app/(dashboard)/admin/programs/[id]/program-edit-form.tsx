'use client'

import { useState } from 'react'
import { updateProgram } from '../../../admin/actions'
import type { Database } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'

type Program = Database['public']['Tables']['programs']['Row']

const DAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

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

export function ProgramEditForm({ program }: { program: Program }) {
  const updateWithId = updateProgram.bind(null, program.id)

  const initial = (program.allowed_classifications as string[] | null) ?? []
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set(initial))

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
        Edit Program
      </summary>
      <form action={updateWithId} className="space-y-4 px-6 pb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" type="text" required defaultValue={program.name} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="type">Type</Label>
            <select id="type" name="type" required defaultValue={program.type} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="group">Group</option>
              <option value="squad">Squad</option>
              <option value="school">School</option>
              <option value="competition">Competition</option>
            </select>
          </div>
          <div>
            <Label htmlFor="level">Level (display)</Label>
            <select id="level" name="level" required defaultValue={program.level} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="blue">Blue ball</option>
              <option value="red">Red ball</option>
              <option value="orange">Orange ball</option>
              <option value="green">Green ball</option>
              <option value="yellow">Yellow ball</option>
              <option value="advanced">Advanced</option>
              <option value="elite">Elite</option>
              <option value="competitive">Competitive</option>
            </select>
          </div>
          <div>
            <Label htmlFor="day_of_week">Day</Label>
            <select id="day_of_week" name="day_of_week" defaultValue={program.day_of_week?.toString() ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select...</option>
              {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <select id="status" name="status" defaultValue={program.status} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <Label htmlFor="start_time">Start time</Label>
            <Input id="start_time" name="start_time" type="time" defaultValue={program.start_time ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="end_time">End time</Label>
            <Input id="end_time" name="end_time" type="time" defaultValue={program.end_time ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="max_capacity">Max capacity</Label>
            <Input id="max_capacity" name="max_capacity" type="number" min="1" defaultValue={program.max_capacity ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="per_session_dollars">Per session ($)</Label>
            <Input id="per_session_dollars" name="per_session_dollars" type="number" step="0.01" min="0" defaultValue={program.per_session_cents ? (program.per_session_cents / 100).toFixed(2) : ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="term_fee_dollars">Term fee ($)</Label>
            <Input id="term_fee_dollars" name="term_fee_dollars" type="number" step="0.01" min="0" defaultValue={program.term_fee_cents ? (program.term_fee_cents / 100).toFixed(2) : ''} className="mt-1" />
          </div>

          <div className="sm:col-span-2">
            <Label>Allowed classifications</Label>
            <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
              Which player classifications can enrol. Leave empty to default to the level above.
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
            <input type="hidden" name="allowed_classifications" value={[...selectedClasses].join(',')} />
          </div>

          <div>
            <Label htmlFor="gender_restriction">Gender restriction</Label>
            <select id="gender_restriction" name="gender_restriction" defaultValue={program.gender_restriction ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">No restriction</option>
              <option value="female">Female only</option>
              <option value="male">Male only</option>
            </select>
          </div>
          <div>
            <Label htmlFor="track_required">Track required</Label>
            <select id="track_required" name="track_required" defaultValue={program.track_required ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Any (visible to everyone)</option>
              <option value="performance">Performance only</option>
              <option value="participation">Participation only</option>
            </select>
          </div>

          <div>
            <Label htmlFor="early_pay_discount_pct">Early-bird tier 1 (%)</Label>
            <Input id="early_pay_discount_pct" name="early_pay_discount_pct" type="number" min="0" max="100" defaultValue={program.early_pay_discount_pct ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="early_bird_deadline">Tier 1 deadline</Label>
            <Input id="early_bird_deadline" name="early_bird_deadline" type="date" defaultValue={program.early_bird_deadline ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="early_pay_discount_pct_tier2">Early-bird tier 2 (%)</Label>
            <Input id="early_pay_discount_pct_tier2" name="early_pay_discount_pct_tier2" type="number" min="0" max="100" defaultValue={program.early_pay_discount_pct_tier2 ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="early_bird_deadline_tier2">Tier 2 deadline</Label>
            <Input id="early_bird_deadline_tier2" name="early_bird_deadline_tier2" type="date" defaultValue={program.early_bird_deadline_tier2 ?? ''} className="mt-1" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} defaultValue={program.description ?? ''} className="mt-1" />
          </div>
        </div>
        <Button type="submit">Save changes</Button>
      </form>
    </details>
  )
}
