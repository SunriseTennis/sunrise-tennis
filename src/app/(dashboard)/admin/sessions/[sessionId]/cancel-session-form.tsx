'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { XCircle } from 'lucide-react'
import { cancelSession } from '../../actions'
import { CancelSessionModal } from '@/components/admin/cancel-session-modal'

export function CancelSessionForm({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm(payload: { category: 'rain_out' | 'heat_out' | 'other'; reason: string }) {
    const fd = new FormData()
    fd.set('cancellation_category', payload.category)
    if (payload.reason) fd.set('cancellation_reason', payload.reason)
    startTransition(async () => {
      try {
        await cancelSession(sessionId, fd)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('NEXT_REDIRECT')) {
          console.error('cancel session failed', e)
        }
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <div className="rounded-xl border border-danger/30 bg-card p-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="gap-2 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
        >
          <XCircle className="size-4" />
          Cancel this session
        </Button>
      </div>

      <CancelSessionModal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this session?"
        description="Notifies enrolled families and adjusts charges. Pay-now bookings get credits; pay-later bookings have upcoming charges removed."
        isPending={isPending}
        onConfirm={handleConfirm}
      />
    </>
  )
}
