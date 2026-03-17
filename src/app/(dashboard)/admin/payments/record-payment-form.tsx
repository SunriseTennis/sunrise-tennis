'use client'

import { recordPayment } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

const PAYMENT_METHODS = ['square', 'bank_transfer', 'cash']
const INCOME_CATEGORIES = [
  'Individual Lesson',
  'Group Session',
  'Program',
  'Court Hire Pass-Through',
  'Sports Voucher Redemption',
  'Clinic',
  'Other',
]

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export function RecordPaymentForm({
  families,
}: {
  families: { id: string; display_id: string; family_name: string }[]
}) {
  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold text-foreground">Record Payment</h2>
        <form action={recordPayment} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="family_id">
              Family *
            </Label>
            <select
              id="family_id"
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
            <Label htmlFor="amount_dollars">
              Amount ($) *
            </Label>
            <Input
              id="amount_dollars"
              name="amount_dollars"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="85.00"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="payment_method">
              Payment Method *
            </Label>
            <select
              id="payment_method"
              name="payment_method"
              required
              className={selectClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="category">
              Category
            </Label>
            <select
              id="category"
              name="category"
              className={selectClass}
            >
              <option value="">Select category...</option>
              {INCOME_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="status">
              Status
            </Label>
            <select
              id="status"
              name="status"
              className={selectClass}
            >
              <option value="received">Received</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div>
            <Label htmlFor="description">
              Description
            </Label>
            <Input
              id="description"
              name="description"
              type="text"
              placeholder="e.g. Term 1 group sessions"
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="notes">
              Notes
            </Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit">
              Record Payment
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
