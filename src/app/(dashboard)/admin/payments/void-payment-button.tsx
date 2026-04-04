'use client'

import { useState } from 'react'
import { voidPaymentAction } from './actions'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <form action={voidPaymentAction.bind(null, paymentId)}>
          <Button type="submit" size="xs" variant="destructive">
            Confirm void
          </Button>
        </form>
        <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <Button
      size="xs"
      variant="ghost"
      className="text-danger hover:text-danger"
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-3.5" />
    </Button>
  )
}
