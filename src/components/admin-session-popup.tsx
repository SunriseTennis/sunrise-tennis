'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CalendarEvent } from '@/components/weekly-calendar'
import { Users, X, ExternalLink, Eye, XCircle, CheckCircle, ListChecks, RotateCcw, Loader2 } from 'lucide-react'
import { cancelSession, adminReopenSession } from '@/app/(dashboard)/admin/actions'
import { CancelSessionModal } from '@/components/admin/cancel-session-modal'
import { ManageSessionModal } from '@/components/admin/manage-session-modal'

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-muted text-muted-foreground',
  completed: 'bg-success/15 text-success border border-success/30',
  cancelled: 'bg-danger/10 text-danger border border-danger/30',
  rained_out: 'bg-blue-100 text-blue-700',
}

export function AdminSessionPopup({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [manageOpen, setManageOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reopenPending, startReopenTransition] = useTransition()

  const status = event.sessionStatus ?? 'scheduled'
  const isScheduled = status === 'scheduled'
  const isCompleted = status === 'completed'
  const isCancelled = status === 'cancelled'

  function handleConfirmCancel(payload: { category: 'rain_out' | 'heat_out' | 'other'; reason: string }) {
    if (!event.sessionId) return
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('cancellation_category', payload.category)
        if (payload.reason) fd.set('cancellation_reason', payload.reason)
        await cancelSession(event.sessionId!, fd)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('NEXT_REDIRECT')) console.error('cancel session failed', e)
      }
      setCancelOpen(false)
      onClose()
      router.refresh()
    })
  }

  function handleReopen() {
    if (!event.sessionId) return
    if (!confirm('Reopen this session for edits? Status flips back to scheduled. Attendance + charges stay as-is.')) return
    startReopenTransition(async () => {
      try {
        await adminReopenSession(event.sessionId!)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('NEXT_REDIRECT')) console.error('reopen failed', e)
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground leading-tight">{event.title}</h3>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.scheduled}`}>
              {status.replace('_', ' ')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          {event.bookedCount !== undefined && (
            <div className="flex items-center gap-2">
              <Users className="size-3.5 shrink-0" />
              <span>{event.bookedCount} player{event.bookedCount !== 1 ? 's' : ''} booked</span>
            </div>
          )}
          {event.coachName && (
            <div className="flex items-center gap-2">
              <span className="size-3.5 shrink-0 text-center text-xs font-bold">L</span>
              <span>{event.coachName}</span>
            </div>
          )}
          {event.assistantCoaches && event.assistantCoaches.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="size-3.5 shrink-0 text-center text-xs font-bold">A</span>
              <span>{event.assistantCoaches.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            {event.sessionId && (
              <Link
                href={event.programId
                  ? `/admin/programs/${event.programId}/sessions/${event.sessionId}`
                  : `/admin/sessions/${event.sessionId}`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#2B5EA7] px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110"
              >
                <Eye className="size-3.5" />
                Session
              </Link>
            )}
            {event.programId && (
              <Link
                href={`/admin/programs/${event.programId}`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted/50"
              >
                <ExternalLink className="size-3.5" />
                Program
              </Link>
            )}
          </div>

          {/* Scheduled: Manage / Complete (modal) + Cancel session (reason modal) */}
          {isScheduled && event.sessionId && (
            <>
              {event.programId && (
                <button
                  onClick={() => setManageOpen(true)}
                  disabled={isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm font-medium text-success transition-all hover:bg-success/10 disabled:opacity-50"
                >
                  <ListChecks className="size-3.5" />
                  Manage / Complete
                </button>
              )}
              <button
                onClick={() => setCancelOpen(true)}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger transition-all hover:bg-danger/10 disabled:opacity-50"
              >
                <XCircle className="size-3.5" />
                {isPending ? 'Cancelling…' : 'Cancel session'}
              </button>
            </>
          )}

          {/* Completed: re-open manage modal (attendance + coach edits) OR reopen status */}
          {isCompleted && event.sessionId && (
            <>
              {event.programId && (
                <button
                  onClick={() => setManageOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted/60"
                >
                  <CheckCircle className="size-3.5 text-success" />
                  View / edit attendance
                </button>
              )}
              <button
                onClick={handleReopen}
                disabled={reopenPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-all hover:bg-amber-100 disabled:opacity-50"
              >
                {reopenPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                Reopen for edits
              </button>
            </>
          )}

          {/* Cancelled: read-only reason display, no actions */}
          {isCancelled && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
              <div className="font-medium">Session cancelled</div>
              <div className="mt-0.5 text-danger/80">
                Open the session page to view cancellation reason or to issue further adjustments.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {event.sessionId && event.programId && (
        <ManageSessionModal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          sessionId={event.sessionId}
          programId={event.programId}
          currentStatus={status as 'scheduled' | 'completed'}
          onCancelSessionClicked={() => setCancelOpen(true)}
        />
      )}
      {event.sessionId && (
        <CancelSessionModal
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title="Cancel this session?"
          description="Notifies enrolled families and adjusts charges. Pay-now bookings get credits; pay-later bookings have upcoming charges removed."
          isPending={isPending}
          onConfirm={handleConfirmCancel}
        />
      )}
    </>
  )
}
