'use client'

import { updateProgram } from '../../../admin/actions'
import type { Database } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

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

export function ProgramEditForm({ program }: { program: Program }) {
  const updateWithId = updateProgram.bind(null, program.id)

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
            <Label htmlFor="level">Level</Label>
            <select id="level" name="level" required defaultValue={program.level} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="red">Red ball</option>
              <option value="orange">Orange ball</option>
              <option value="green">Green ball</option>
              <option value="yellow">Yellow ball</option>
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
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} defaultValue={program.description ?? ''} className="mt-1" />
          </div>
        </div>
        <Button type="submit">Save changes</Button>
      </form>
    </details>
  )
}
