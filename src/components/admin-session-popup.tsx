'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import type { CalendarEvent } from '@/components/weekly-calendar'
import { Users, X, ExternalLink, Eye, CloudRain, XCircle, CheckCircle } from 'lucide-react'
import { cancelSession, adminCompleteSession } from '@/app/(dashboard)/admin/actions'

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-muted text-muted-foreground',
  completed: 'bg-success/10 text-success',
  cancelled: 'bg-danger/10 text-danger',
  rained_out: 'bg-blue-100 text-blue-700',
}

export function AdminSessionPopup({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()

  function handleCancel() {
    if (!event.sessionId || !confirm('Cancel this session? Enrolled families will be credited.')) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('reason', 'Cancelled from calendar')
      await cancelSession(event.sessionId!, fd)
    })
  }

  function handleRainOut() {
    if (!event.sessionId || !confirm('Rain out this session? Enrolled families will be credited and notified.')) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('reason', 'Rained out — no charge')
      await cancelSession(event.sessionId!, fd)
    })
  }

  function handleComplete() {
    if (!event.sessionId || !confirm('Mark this session as complete?')) return
    startTransition(async () => {
      await adminCompleteSession(event.sessionId!)
    })
  }

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground leading-tight">{event.title}</h3>
          {event.sessionStatus && (
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[event.sessionStatus] ?? STATUS_STYLES.scheduled}`}>
              {event.sessionStatus.replace('_', ' ')}
            </span>
          )}
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
        {event.sessionStatus === 'scheduled' && event.sessionId && (
          <>
            <button
              onClick={handleComplete}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm font-medium text-success transition-all hover:bg-success/10 disabled:opacity-50"
            >
              <CheckCircle className="size-3.5" />
              {isPending ? 'Completing...' : 'Complete'}
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger transition-all hover:bg-danger/10 disabled:opacity-50"
              >
                <XCircle className="size-3.5" />
                {isPending ? 'Cancelling...' : 'Cancel'}
              </button>
              <button
                onClick={handleRainOut}
                disabled={isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100 disabled:opacity-50"
              >
                <CloudRain className="size-3.5" />
                {isPending ? 'Cancelling...' : 'Rained Out'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
