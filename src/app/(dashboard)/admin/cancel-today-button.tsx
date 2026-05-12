'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { cancelTodaySessions } from './actions'
import { CancelSessionModal } from '@/components/admin/cancel-session-modal'

export function CancelTodayButton({ todaySessionCount }: { todaySessionCount: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm(payload: { category: 'rain_out' | 'heat_out' | 'other'; reason: string }) {
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('cancellation_category', payload.category)
        if (payload.reason) fd.set('cancellation_reason', payload.reason)
        await cancelTodaySessions(fd)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('NEXT_REDIRECT')) console.error('cancel today sessions failed', e)
      }
      setOpen(false)
      router.refresh()
    })
  }

  if (todaySessionCount === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
      >
        <Ban className="size-4" />
        Cancel Today ({todaySessionCount} session{todaySessionCount !== 1 ? 's' : ''})
      </button>

      <CancelSessionModal
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel all ${todaySessionCount} session${todaySessionCount !== 1 ? 's' : ''} today?`}
        description="All enrolled families will be notified. Pre-paid sessions will be credited; pay-later upcoming charges will be removed."
        confirmLabel="Confirm cancellation"
        isPending={isPending}
        onConfirm={handleConfirm}
      />
    </>
  )
}
