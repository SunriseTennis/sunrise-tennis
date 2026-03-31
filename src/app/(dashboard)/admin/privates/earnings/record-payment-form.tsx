'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { recordCoachPayment } from '../actions'

interface Coach {
  id: string
  name: string
  owed: number
}

interface Props {
  coaches: Coach[]
}

export function RecordPaymentForm({ coaches }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Record Payment</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Record a payment made to a coach. This marks their owed earnings as paid.
        </p>
        <form action={recordCoachPayment} className="mt-4 space-y-3">
          <div>
            <Label htmlFor="coach_id" className="text-xs">Coach</Label>
            <select
              id="coach_id"
              name="coach_id"
              required
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select coach...</option>
              {coaches.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — ${(c.owed / 100).toFixed(2)} owed
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="amount" className="text-xs">Amount ($)</Label>
            <Input
              id="amount"
              name="amount_dollars"
              type="text"
              required
              placeholder="e.g. 120.00"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="notes" className="text-xs">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              className="mt-1 h-16"
              placeholder="e.g. Cash payment for week 14"
            />
          </div>
          <Button type="submit" size="sm">Record Payment</Button>
        </form>
      </CardContent>
    </Card>
  )
}
