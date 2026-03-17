'use client'

import { createInvoice } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export function CreateInvoiceForm({
  families,
}: {
  families: { id: string; display_id: string; family_name: string }[]
}) {
  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold text-foreground">Create Invoice</h2>
        <form action={createInvoice} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="inv_family_id">
              Family *
            </Label>
            <select
              id="inv_family_id"
              name="family_id"
              required
              className={selectClass}
            >
              <option value="">Select family...</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.display_id} ({f.family_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="inv_amount_dollars">
              Amount ($) *
            </Label>
            <Input
              id="inv_amount_dollars"
              name="amount_dollars"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="170.00"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="inv_description">
              Description *
            </Label>
            <Input
              id="inv_description"
              name="description"
              type="text"
              required
              placeholder="e.g. Term 1 Red Ball Group - 10 sessions"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="inv_due_date">
              Due Date
            </Label>
            <Input
              id="inv_due_date"
              name="due_date"
              type="date"
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit">
              Create Invoice
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
