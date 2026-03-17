'use client'

import { updatePlayer } from '../../../../actions'
import type { Database } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Player = Database['public']['Tables']['players']['Row']

const ballColors = ['red', 'orange', 'green', 'yellow', 'competitive']

export function PlayerEditForm({ player, familyId }: { player: Player; familyId: string }) {
  const updateWithIds = updatePlayer.bind(null, player.id, familyId)

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
            <Label htmlFor="dob">Date of birth</Label>
            <Input id="dob" name="dob" type="date" defaultValue={player.dob ?? ''} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="ball_color">Ball colour</Label>
            <select id="ball_color" name="ball_color" defaultValue={player.ball_color ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select...</option>
              {ballColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="level">Level</Label>
            <select id="level" name="level" defaultValue={player.level ?? ''} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select...</option>
              {ballColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
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
          <div className="sm:col-span-2">
            <Label htmlFor="medical_notes">Medical notes</Label>
            <Textarea id="medical_notes" name="medical_notes" rows={2} defaultValue={player.medical_notes ?? ''} className="mt-1" />
          </div>
        </div>
        <Button type="submit">Save changes</Button>
      </form>
    </details>
  )
}
