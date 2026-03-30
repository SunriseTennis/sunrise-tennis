'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addCompPlayer } from '@/app/(dashboard)/admin/competitions/actions'

const selectClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export function AddPlayerForm({
  competitionId,
  teamId,
}: {
  competitionId: string
  teamId: string
}) {
  const action = addCompPlayer.bind(null, competitionId)

  return (
    <form action={action}>
      <input type="hidden" name="team_id" value={teamId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="first_name">First name *</Label>
          <Input id="first_name" name="first_name" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" name="last_name" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="age">Age</Label>
          <Input id="age" name="age" type="number" min="5" max="99" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="gender">Gender</Label>
          <select id="gender" name="gender" className={selectClass}>
            <option value="">-</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <Label htmlFor="role">Role *</Label>
          <select id="role" name="role" required className={selectClass}>
            <option value="mainstay">Mainstay</option>
            <option value="fill_in">Fill in</option>
            <option value="potential">Potential</option>
          </select>
        </div>
        <div>
          <Label htmlFor="registration_status">Registration *</Label>
          <select id="registration_status" name="registration_status" required className={selectClass}>
            <option value="registered">Registered</option>
            <option value="unregistered">Unregistered</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" className="mt-1" placeholder="e.g. Also in JSL team" />
        </div>
      </div>
      <div className="mt-4">
        <Button type="submit" size="sm">Add Player</Button>
      </div>
    </form>
  )
}
