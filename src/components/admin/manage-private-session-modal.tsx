'use client'

/**
 * Manage Private Session modal.
 *
 * Plan `velvety-whistling-boot` — calendar-popup entry point for marking
 * private session attendance. Mirrors the `<ManageSessionModal>` shape:
 * portaled to <body>, sticky header with deep-link, body = <PrivateAttendanceForm>.
 *
 * Used by:
 *   - `<AdminSessionPopup>` on the /admin overview calendar
 *   - `/admin/privates` Calendar tab popup
 *   - `/admin/privates` Series tab per-session row
 *   - `/coach/schedule` calendar popup
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ExternalLink, Loader2, X, AlertCircle } from 'lucide-react'
import {
  getManagePrivateData,
} from '@/app/(dashboard)/admin/privates/actions'
import { PrivateAttendanceForm, type PrivateAttendanceBooking } from './private-attendance-form'

type ManagePrivateData = NonNullable<Awaited<ReturnType<typeof getManagePrivateData>>['data']>

export function ManagePrivateSessionModal({
  open,
  onClose,
  sessionId,
  /** Deep-link to the per-session detail page. Optional — when omitted, no "Open page" link renders. */
  deepLinkHref,
}: {
  open: boolean
  onClose: () => void
  sessionId: string
  deepLinkHref?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<ManagePrivateData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) {
      setData(null)
      setLoadError(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)
    getManagePrivateData(sessionId).then((res) => {
      if (cancelled) return
      if (res.error) setLoadError(res.error)
      else if (res.data) setData(res.data)
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [open, sessionId])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted || !open) return null

  const bookings: PrivateAttendanceBooking[] = (data?.bookings ?? []).map(b => ({
    id: b.id,
    playerId: b.player_id,
    playerFirstName: b.players?.first_name ?? 'Player',
    playerLastName: b.players?.last_name ?? null,
    familyId: b.family_id,
    priceCents: b.price_cents,
  }))

  return createPortal(
    <div
      data-popup-overlay
      className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-popover shadow-elevated animate-slide-up max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-popover/95 backdrop-blur px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Mark attendance</h2>
            {data && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                Private · {formatDate(data.session.date)}
                {data.session.start_time ? ` · ${data.session.start_time.slice(0, 5)}` : ''}
                {data.session.coach_name ? ` · ${data.session.coach_name.split(' ')[0]}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {deepLinkHref && (
              <Link
                href={deepLinkHref}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                title="Open full session page"
              >
                <ExternalLink className="size-3.5" />
                Open page
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" /> Loading session…
            </div>
          )}

          {loadError && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
              <AlertCircle className="size-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {data && data.session.status !== 'scheduled' && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              This session is <strong className="text-foreground">{data.session.status}</strong>. Attendance can only be marked on scheduled sessions.
            </div>
          )}

          {data && data.session.status === 'scheduled' && (
            <PrivateAttendanceForm
              sessionId={sessionId}
              bookings={bookings}
              onSubmitted={() => onClose()}
              compact
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function formatDate(date: string): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return date
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}
