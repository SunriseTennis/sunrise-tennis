'use client'

import { adminBookPlayer } from '../../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export function AdminEnrolForm({
  programId,
  families,
}: {
  programId: string
  families: { id: string; displayId: string; familyName: string; players: { id: string; firstName: string; lastName: string }[] }[]
}) {
  return (
    <details className="rounded-xl border border-border bg-card shadow-sm">
      <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-primary hover:text-primary/80">
        + Enrol player on behalf of family
      </summary>
      <form action={adminBookPlayer} className="space-y-4 px-6 pb-6">
        <input type="hidden" name="program_id" value={programId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="family_player">Family / Player</Label>
            <select id="family_player" name="family_player" required className={selectClass} onChange={(e) => {
              const [fam, play] = e.target.value.split('|')
              const form = e.target.form!
              ;(form.querySelector('[name=family_id]') as HTMLInputElement).value = fam
              ;(form.querySelector('[name=player_id]') as HTMLInputElement).value = play
            }}>
              <option value="">Select a player...</option>
              {families.map((f) => (
                <optgroup key={f.id} label={`${f.displayId} - ${f.familyName}`}>
                  {f.players.map((p) => (
                    <option key={p.id} value={`${f.id}|${p.id}`}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input type="hidden" name="family_id" value="" />
            <input type="hidden" name="player_id" value="" />
          </div>
          <div>
            <Label htmlFor="booking_type">Booking type</Label>
            <select id="booking_type" name="booking_type" required className={selectClass}>
              <option value="term">Term enrolment</option>
              <option value="trial">Trial</option>
              <option value="casual">Casual</option>
            </select>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" type="text" className="mt-1" placeholder="Optional" />
          </div>
        </div>
        <Button type="submit">Enrol player</Button>
      </form>
    </details>
  )
}
