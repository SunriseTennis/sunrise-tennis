'use client'

/**
 * Plan `velvety-whistling-boot` — wrapper card for the admin per-session detail
 * page (private branch). Hosts the attendance picker + a "Cancel whole session"
 * link to the existing rain-out path.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { PrivateAttendanceForm, type PrivateAttendanceBooking } from '@/components/admin/private-attendance-form'
import { CancelSessionModal } from '@/components/admin/cancel-session-modal'
import { cancelSession } from '@/app/(dashboard)/admin/actions'

export function PrivateSessionActionCard({
  sessionId,
  bookings,
}: {
  sessionId: string
  bookings: PrivateAttendanceBooking[]
}) {
  const router = useRouter()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleConfirmCancel(payload: { category: 'rain_out' | 'heat_out' | 'other'; reason: string }) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('cancellation_category', payload.category)
      if (payload.reason) fd.set('cancellation_reason', payload.reason)
      const res = await cancelSession(sessionId, fd, { silent: true })
      if (res?.error) {
        console.error('cancel session failed:', res.error)
        return
      }
      setCancelOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Mark attendance</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Marks the session complete and confirms charges. On a shared session, marking
              one player Absent or No-show converts to a solo and tops up the remaining family.
            </p>
          </div>

          <PrivateAttendanceForm
            sessionId={sessionId}
            bookings={bookings}
            onSubmitted={() => router.refresh()}
            compact
          />

          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-danger hover:underline"
            >
              <XCircle className="size-3.5" />
              Cancel whole session (rain/heat/other)
            </button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cancels both halves of a shared private and notifies every family. Different from marking absent.
            </p>
          </div>
        </CardContent>
      </Card>

      <CancelSessionModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this session?"
        description="Notifies every booked family and adjusts charges (pay-now → credit, pay-later → upcoming charge removed)."
        isPending={pending}
        onConfirm={handleConfirmCancel}
      />
    </>
  )
}

