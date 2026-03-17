'use client'

import { confirmPayment } from './actions'
import { Button } from '@/components/ui/button'

export function ConfirmPaymentButton({ paymentId }: { paymentId: string }) {
  return (
    <form action={confirmPayment.bind(null, paymentId)}>
      <Button type="submit" size="xs">
        Confirm
      </Button>
    </form>
  )
}
