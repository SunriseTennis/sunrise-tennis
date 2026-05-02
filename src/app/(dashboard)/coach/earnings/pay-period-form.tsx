'use client'

import { Button } from '@/components/ui/button'
import { updatePayPeriod } from '../actions'

export function PayPeriodForm({ payPeriod }: { payPeriod: string }) {
  return (
    <form action={updatePayPeriod} className="flex items-center gap-2">
      <select
        name="pay_period"
        defaultValue={payPeriod}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="weekly">Weekly</option>
        <option value="end_of_term">End of term</option>
      </select>
      <Button type="submit" size="sm" variant="outline" className="h-8">Save</Button>
    </form>
  )
}
