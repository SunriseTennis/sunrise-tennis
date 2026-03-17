'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { createProgram } from '../../actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

const DAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

function NewProgramForm() {
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

      <form action={createProgram}>
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Program name *</Label>
                <Input id="name" name="name" type="text" required className="mt-1" />
              </div>

              <div>
                <Label htmlFor="type">Type *</Label>
                <select id="type" name="type" required className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="group">Group</option>
                  <option value="squad">Squad</option>
                  <option value="school">School</option>
                  <option value="competition">Competition</option>
                </select>
              </div>

              <div>
                <Label htmlFor="level">Level *</Label>
                <select id="level" name="level" required className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="red">Red ball</option>
                  <option value="orange">Orange ball</option>
                  <option value="green">Green ball</option>
                  <option value="yellow">Yellow ball</option>
                  <option value="competitive">Competitive</option>
                </select>
              </div>

              <div>
                <Label htmlFor="day_of_week">Day</Label>
                <select id="day_of_week" name="day_of_week" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Select...</option>
                  {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>

              <div>
                <Label htmlFor="max_capacity">Max capacity</Label>
                <Input id="max_capacity" name="max_capacity" type="number" min="1" className="mt-1" />
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
                <Label htmlFor="per_session_dollars">Per session ($)</Label>
                <Input id="per_session_dollars" name="per_session_dollars" type="number" step="0.01" min="0" placeholder="e.g. 25.00" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="term_fee_dollars">Term fee ($)</Label>
                <Input id="term_fee_dollars" name="term_fee_dollars" type="number" step="0.01" min="0" placeholder="e.g. 200.00" className="mt-1" />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" rows={3} className="mt-1" />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button type="submit">Create program</Button>
              <Button variant="outline" asChild>
                <Link href="/admin/programs">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </>
  )
}

export default function NewProgramPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Add New Program</h1>
      <p className="mt-1 text-sm text-muted-foreground">Create a new group program, squad, or school program.</p>
      <div className="mt-6">
        <Suspense>
          <NewProgramForm />
        </Suspense>
      </div>
    </div>
  )
}
