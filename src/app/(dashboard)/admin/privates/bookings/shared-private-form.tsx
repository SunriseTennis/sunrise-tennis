'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminCreateSharedPrivate } from '../actions'

interface Family {
  id: string
  display_id: string
  family_name: string
}

interface Coach {
  id: string
  name: string
  rate: number
}

interface Props {
  families: Family[]
  coaches: Coach[]
  /** When true, renders the form directly without the toggle button (e.g. inside a modal). */
  alwaysExpanded?: boolean
}

export function SharedPrivateForm({ families, coaches, alwaysExpanded = false }: Props) {
  const [showForm, setShowForm] = useState(alwaysExpanded)

  if (!showForm) {
    return (
      <Button onClick={() => setShowForm(true)} size="sm" variant="outline">
        Book Shared Private (2 players)
      </Button>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Shared Private Lesson</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          2 players share one session. Cost is split 50/50 between families.
        </p>
        <form action={adminCreateSharedPrivate} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground">Player 1</p>
              <div>
                <Label htmlFor="family_id_1" className="text-xs">Family</Label>
                <select id="family_id_1" name="family_id_1" required className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {families.map(f => <option key={f.id} value={f.id}>{f.display_id} - {f.family_name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="player_name_1" className="text-xs">Player Name</Label>
                <Input id="player_name_1" name="player_name_1" required placeholder="First name" className="mt-1" />
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground">Player 2</p>
              <div>
                <Label htmlFor="family_id_2" className="text-xs">Family</Label>
                <select id="family_id_2" name="family_id_2" required className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {families.map(f => <option key={f.id} value={f.id}>{f.display_id} - {f.family_name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="player_name_2" className="text-xs">Player Name</Label>
                <Input id="player_name_2" name="player_name_2" required placeholder="First name" className="mt-1" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="shared_coach" className="text-xs">Coach</Label>
              <select id="shared_coach" name="coach_id" required className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select...</option>
                {[...coaches].filter(c => c.rate > 0).sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name.split(' ')[0]} - ${(c.rate / 100).toFixed(0)}/hr</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="shared_date" className="text-xs">Date</Label>
              <Input id="shared_date" name="date" type="date" required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="shared_time" className="text-xs">Start Time</Label>
              <Input id="shared_time" name="start_time" type="time" required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="shared_duration" className="text-xs">Duration</Label>
              <select id="shared_duration" name="duration_minutes" required className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm">Book Shared Private</Button>
            {!alwaysExpanded && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
