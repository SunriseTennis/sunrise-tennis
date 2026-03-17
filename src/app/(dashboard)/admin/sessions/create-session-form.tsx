'use client'

import { createSession } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const selectClass = 'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export function CreateSessionForm({
  programs,
  coaches,
  venues,
}: {
  programs: { id: string; name: string }[]
  coaches: { id: string; name: string }[]
  venues: { id: string; name: string }[]
}) {
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold text-foreground">
        + Create Session
      </summary>
      <form action={createSession} className="space-y-4 px-6 pb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="program_id">Program</Label>
            <select id="program_id" name="program_id" className={`mt-1 block w-full ${selectClass}`}>
              <option value="">No program (ad-hoc)</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="session_type">Type *</Label>
            <select id="session_type" name="session_type" required className={`mt-1 block w-full ${selectClass}`}>
              <option value="group">Group</option>
              <option value="private">Private</option>
              <option value="squad">Squad</option>
              <option value="school">School</option>
              <option value="trial">Trial</option>
              <option value="competition">Competition</option>
            </select>
          </div>
          <div>
            <Label htmlFor="date">Date *</Label>
            <Input id="date" name="date" type="date" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="coach_id">Coach</Label>
            <select id="coach_id" name="coach_id" className={`mt-1 block w-full ${selectClass}`}>
              <option value="">Unassigned</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="start_time">Start time</Label>
            <Input id="start_time" name="start_time" type="time" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="end_time">End time</Label>
            <Input id="end_time" name="end_time" type="time" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="venue_id">Venue</Label>
            <select id="venue_id" name="venue_id" className={`mt-1 block w-full ${selectClass}`}>
              <option value="">No venue</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>
        <Button type="submit">
          Create session
        </Button>
      </form>
    </details>
  )
}
