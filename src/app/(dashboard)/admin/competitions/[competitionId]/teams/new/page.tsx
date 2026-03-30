'use client'

import { Suspense, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import { createCompTeam } from '@/app/(dashboard)/admin/competitions/actions'

const selectClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

function NewTeamForm({ competitionId }: { competitionId: string }) {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-danger/20 bg-danger-light p-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <form action={createCompTeam}>
        <input type="hidden" name="competition_id" value={competitionId} />
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Team name *</Label>
                <Input id="name" name="name" required className="mt-1" placeholder="e.g. Div 2 Boys" />
              </div>

              <div>
                <Label htmlFor="division">Division</Label>
                <Input id="division" name="division" className="mt-1" placeholder="e.g. Division 2" />
              </div>

              <div>
                <Label htmlFor="gender">Gender</Label>
                <select id="gender" name="gender" className={selectClass}>
                  <option value="">Any</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>

              <div>
                <Label htmlFor="age_group">Age group</Label>
                <select id="age_group" name="age_group" className={selectClass}>
                  <option value="">Not specified</option>
                  <option value="senior">Senior</option>
                  <option value="junior">Junior</option>
                </select>
              </div>

              <div>
                <Label htmlFor="team_size_required">Required team size</Label>
                <Input id="team_size_required" name="team_size_required" type="number" min="1" max="20" className="mt-1" placeholder="e.g. 4" />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button type="submit">Create Team</Button>
              <Button variant="outline" asChild>
                <Link href={`/admin/competitions/${competitionId}`}>Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </>
  )
}

export default function NewCompTeamPage({
  params,
}: {
  params: Promise<{ competitionId: string }>
}) {
  const { competitionId } = use(params)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/competitions/${competitionId}`} className="text-sm text-muted-foreground hover:text-primary">
          &larr; Back
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-foreground">Add Team</h1>
      </div>

      <div className="mt-6">
        <Suspense>
          <NewTeamForm competitionId={competitionId} />
        </Suspense>
      </div>
    </div>
  )
}
