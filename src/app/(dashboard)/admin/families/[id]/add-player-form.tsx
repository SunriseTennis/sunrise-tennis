'use client'

import { createPlayer } from '../../../admin/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const ballColors = ['red', 'orange', 'green', 'yellow', 'competitive']

export function AddPlayerForm({ familyId }: { familyId: string }) {
  const createWithFamily = createPlayer.bind(null, familyId)

  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium text-primary hover:text-primary/80">
        + Add player
      </summary>
      <form action={createWithFamily} className="mt-3 grid gap-3 sm:grid-cols-2">
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
          <Label htmlFor="ball_color">Ball colour</Label>
          <select id="ball_color" name="ball_color" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="">Select...</option>
            {ballColors.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="level">Level</Label>
          <select id="level" name="level" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="">Select...</option>
            {ballColors.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="medical_notes">Medical notes</Label>
          <Textarea id="medical_notes" name="medical_notes" rows={2} className="mt-1" placeholder="Allergies, injuries, conditions..." />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit">Add player</Button>
        </div>
      </form>
    </details>
  )
}
