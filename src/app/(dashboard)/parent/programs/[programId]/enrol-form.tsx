'use client'

import { enrolInProgram } from '../actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

export function EnrolForm({
  programId,
  familyId,
  players,
  programLevel,
}: {
  programId: string
  familyId: string
  players: { id: string; name: string; level: string | null }[]
  programLevel: string
}) {
  const enrolWithIds = enrolInProgram.bind(null, programId, familyId)

  return (
    <form action={enrolWithIds}>
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-foreground">Enrol a Player</h2>

          <div className="mt-4">
            <Label htmlFor="player_id">Select player</Label>
            <select
              id="player_id"
              name="player_id"
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Choose a player...</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                  {player.level && player.level !== programLevel && ` (${player.level} ball)`}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <Label htmlFor="booking_type">Booking type</Label>
            <select
              id="booking_type"
              name="booking_type"
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="term">Term enrolment</option>
              <option value="trial">Trial session</option>
              <option value="casual">Casual (single session)</option>
            </select>
          </div>

          <div className="mt-4">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Any special requirements or comments..."
              className="mt-1"
            />
          </div>

          <div className="mt-4">
            <Button type="submit">Confirm Enrolment</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
