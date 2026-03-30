'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import { createCompetition } from '../actions'

const selectClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

function NewCompForm() {
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

      <form action={createCompetition}>
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Competition name *</Label>
                <Input id="name" name="name" required className="mt-1" placeholder="e.g. Winter Pennant" />
              </div>

              <div>
                <Label htmlFor="short_name">Short name</Label>
                <Input id="short_name" name="short_name" className="mt-1" placeholder="e.g. WP" />
              </div>

              <div>
                <Label htmlFor="type">Type *</Label>
                <select id="type" name="type" required className={selectClass}>
                  <option value="external">External (organised by association)</option>
                  <option value="internal">Internal (club-run)</option>
                </select>
              </div>

              <div>
                <Label htmlFor="season">Season *</Label>
                <Input id="season" name="season" required className="mt-1" placeholder="e.g. Winter 2026" />
              </div>

              <div className="sm:col-span-2 mt-2">
                <p className="text-sm font-medium text-foreground">Key Dates</p>
              </div>

              <div>
                <Label htmlFor="nomination_open">Nominations open</Label>
                <Input id="nomination_open" name="nomination_open" type="date" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="nomination_close">Nominations close</Label>
                <Input id="nomination_close" name="nomination_close" type="date" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="season_start">Season start</Label>
                <Input id="season_start" name="season_start" type="date" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="season_end">Season end</Label>
                <Input id="season_end" name="season_end" type="date" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="finals_start">Finals start</Label>
                <Input id="finals_start" name="finals_start" type="date" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="finals_end">Finals end</Label>
                <Input id="finals_end" name="finals_end" type="date" className="mt-1" />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea id="notes" name="notes" rows={3} className={selectClass} placeholder="Byes, rules, etc." />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button type="submit">Create Competition</Button>
              <Button variant="outline" asChild>
                <Link href="/admin/competitions">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </>
  )
}

export default function NewCompetitionPage() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/competitions" className="text-sm text-muted-foreground hover:text-primary">
          &larr; Competitions
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-foreground">New Competition</h1>
      </div>

      <div className="mt-6">
        <Suspense>
          <NewCompForm />
        </Suspense>
      </div>
    </div>
  )
}
