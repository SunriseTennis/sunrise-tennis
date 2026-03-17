import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createTeam } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export default async function NewTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: programs }, { data: coaches }] = await Promise.all([
    supabase.from('programs').select('id, name').eq('status', 'active').order('name'),
    supabase.from('coaches').select('id, name').eq('status', 'active').order('name'),
  ])

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/teams" className="text-sm text-muted-foreground hover:text-primary">&larr; Teams</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-foreground">Create Team</h1>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-danger/20 bg-danger-light p-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <form action={createTeam} className="mt-6 space-y-5">
        <div>
          <Label htmlFor="name">Team Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. U12 Boys A"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="season">Season</Label>
          <Input
            id="season"
            name="season"
            type="text"
            placeholder="e.g. Summer 2026, Term 2 2026"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="coach_id">Coach</Label>
          <select
            id="coach_id"
            name="coach_id"
            className={selectClass}
          >
            <option value="">None</option>
            {coaches?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="program_id">
            Linked Program <span className="text-muted-foreground">(optional)</span>
          </Label>
          <select
            id="program_id"
            name="program_id"
            className={selectClass}
          >
            <option value="">None</option>
            {programs?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="pt-2">
          <Button type="submit">
            Create Team
          </Button>
        </div>
      </form>
    </div>
  )
}
