'use client'

/**
 * Manage Session modal — full-parity inline session management surface.
 *
 * Opens from the admin overview calendar popup ("Manage / Complete"). Loads
 * the same data shape as `/admin/programs/[id]/sessions/[sessionId]` via
 * `getManageSessionData`, then renders the same client sub-components
 * verbatim (`<AttendanceForm>`, `<AddPlayersCard>`, `<CoachAttendanceCard>`)
 * so admin gets every affordance from the session detail page without
 * leaving the calendar.
 *
 * Per Plan delightful-nibbling-sparkle, clicking "Cancel session" inside this
 * modal closes the modal immediately and lets the parent open the shared
 * `<CancelSessionModal>` — no commit until that modal's Confirm is clicked.
 *
 * Mark complete fires `adminCompleteSession` via a nested in-modal confirm.
 */

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, ExternalLink, Loader2, X, XCircle, AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  adminCompleteSession,
  adminReopenSession,
  getManageSessionData,
  type ManageSessionData,
} from '@/app/(dashboard)/admin/actions'
import { AttendanceForm } from '@/app/(dashboard)/admin/programs/[id]/sessions/[sessionId]/attendance-form'
import { AddPlayersCard } from '@/app/(dashboard)/admin/programs/[id]/sessions/[sessionId]/add-players-card'
import { CoachAttendanceCard } from '@/app/(dashboard)/admin/programs/[id]/sessions/[sessionId]/coach-attendance-card'

export function ManageSessionModal({
  open,
  onClose,
  sessionId,
  programId,
  currentStatus,
  onCancelSessionClicked,
}: {
  open: boolean
  onClose: () => void
  sessionId: string
  programId: string
  currentStatus: 'scheduled' | 'completed' | string | undefined
  /** Called after this modal has closed itself; parent opens <CancelSessionModal>. */
  onCancelSessionClicked: () => void
}) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<ManageSessionData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [completePending, startCompleteTransition] = useTransition()
  const [reopenPending, startReopenTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])

  // Load data whenever the modal opens for a new sessionId.
  useEffect(() => {
    if (!open) {
      setData(null)
      setLoadError(null)
      setConfirmComplete(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)
    getManageSessionData(sessionId).then((res) => {
      if (cancelled) return
      if (res.error) {
        setLoadError(res.error)
      } else if (res.data) {
        setData(res.data)
      }
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [open, sessionId])

  // Esc closes (only when no inner confirm is open).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (confirmComplete) { setConfirmComplete(false); return }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, confirmComplete])

  if (!mounted || !open) return null

  function doComplete() {
    startCompleteTransition(async () => {
      const res = await adminCompleteSession(sessionId, { silent: true })
      if (res?.error) {
        console.error('mark complete failed:', res.error)
        setLoadError(res.error)
        setConfirmComplete(false)
        return
      }
      setConfirmComplete(false)
      onClose()
      router.refresh()
    })
  }

  function doReopen() {
    if (!confirm('Reopen this session for edits? Status flips back to scheduled. Attendance + charges stay as-is.')) return
    startReopenTransition(async () => {
      const res = await adminReopenSession(sessionId, { silent: true })
      if (res?.error) {
        console.error('reopen failed:', res.error)
        setLoadError(res.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  function handleCancelClicked() {
    // Plan delightful-nibbling-sparkle: close manage modal first, then let
    // the parent open <CancelSessionModal>. No cancellation fires until
    // that modal's Confirm is clicked.
    onClose()
    // Microtask defer so the close animation isn't visually preempted.
    setTimeout(() => onCancelSessionClicked(), 0)
  }

  const isScheduled = currentStatus === 'scheduled' || currentStatus === undefined
  const isCompleted = currentStatus === 'completed'

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={() => { if (!confirmComplete) onClose() }}
    >
      <div
        className="relative w-full max-w-3xl rounded-t-2xl sm:rounded-2xl border border-border bg-popover shadow-elevated animate-slide-up max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-popover/95 backdrop-blur px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Manage session</h2>
            {data && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {data.programName ?? 'Session'} · {data.date}
                {data.startTime ? ` · ${data.startTime.slice(0, 5)}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {data?.programId && (
              <Link
                href={`/admin/programs/${data.programId}/sessions/${data.sessionId}`}
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

        <div className="p-5 sm:p-6 space-y-5">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" /> Loading session…
            </div>
          )}

          {loadError && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
              <AlertCircle className="size-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {data && (
            <>
              {/* Attendance — only for scheduled OR completed (admin can still tweak after reopen). */}
              {data.attendanceFormPlayers.length > 0 ? (
                <AttendanceForm
                  sessionId={data.sessionId}
                  programId={data.programId ?? ''}
                  players={data.attendanceFormPlayers}
                  attendanceMap={data.attendanceMap}
                />
              ) : (
                <div className="rounded-lg border border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  No players yet. Add a walk-in or term-enrol below.
                </div>
              )}

              {/* Add players — walk-in / term-enrol */}
              {data.programId && (
                <AddPlayersCard
                  sessionId={data.sessionId}
                  programId={data.programId}
                  programLevel={data.programLevel}
                  families={data.families}
                  walkInExcludedIds={data.walkInExcludedIds}
                  termExcludedIds={data.termExcludedIds}
                  futureSessionCount={data.futureSessionCount}
                  earlyBirdTier1Pct={data.earlyBirdTier1Pct}
                  earlyBirdTier2Pct={data.earlyBirdTier2Pct}
                />
              )}

              {/* Coach attendance */}
              {data.programId && (
                <CoachAttendanceCard
                  sessionId={data.sessionId}
                  programId={data.programId}
                  durationMin={data.durationMin}
                  initialCoaches={data.initialCoaches}
                  initialAttendance={data.initialAttendance}
                  candidateSubCoaches={data.candidateSubCoaches}
                />
              )}
            </>
          )}
        </div>

        {/* Sticky footer with action buttons */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-popover/95 backdrop-blur px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
          {isScheduled && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelClicked}
                disabled={completePending}
                className="gap-2 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
              >
                <XCircle className="size-4" />
                Cancel session
              </Button>
              <Button
                type="button"
                onClick={() => setConfirmComplete(true)}
                disabled={completePending || isLoading}
                className="gap-2 bg-success hover:bg-success/90 text-white"
              >
                <CheckCircle2 className="size-4" />
                Mark complete
              </Button>
            </>
          )}
          {isCompleted && (
            <Button
              type="button"
              variant="outline"
              onClick={doReopen}
              disabled={reopenPending}
              className="gap-2"
              title="Flip back to scheduled so attendance/coach attendance/charges become editable again"
            >
              {reopenPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Reopen for edits
            </Button>
          )}
        </div>
      </div>

      {/* Nested confirm modal for Mark complete */}
      {confirmComplete && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmComplete(false)}
        >
          <div
            className="relative w-full max-w-md mx-3 rounded-2xl border border-success/30 bg-popover shadow-elevated animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 sm:p-6">
              <h3 className="text-base font-semibold text-foreground">Mark session complete?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This locks the session. Any roster player you haven&apos;t explicitly marked Absent / No-show
                will be saved as Present. You can Reopen for edits afterwards if needed.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmComplete(false)} disabled={completePending}>
                  Cancel
                </Button>
                <Button type="button" onClick={doComplete} disabled={completePending} className="gap-2 bg-success hover:bg-success/90 text-white">
                  {completePending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Confirm complete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
