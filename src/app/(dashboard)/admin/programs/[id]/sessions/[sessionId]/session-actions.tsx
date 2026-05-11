'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Loader2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { adminCompleteSession, cancelSession } from '../../../../actions'

export function SessionActions({
  sessionId,
  status,
}: {
  sessionId: string
  status: string
}) {
  const router = useRouter()
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  if (status === 'completed' || status === 'cancelled') {
    return null
  }

  function doComplete() {
    startTransition(async () => {
      try {
        await adminCompleteSession(sessionId)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('NEXT_REDIRECT')) {
          console.error('mark complete failed', e)
        }
      }
      setConfirmComplete(false)
      router.refresh()
    })
  }

  function doCancel() {
    if (!reason.trim()) return
    const fd = new FormData()
    fd.set('reason', reason.trim())
    startTransition(async () => {
      try {
        await cancelSession(sessionId, fd)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('NEXT_REDIRECT')) {
          console.error('cancel session failed', e)
        }
      }
      setConfirmCancel(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => setConfirmComplete(true)}
          variant="default"
          className="gap-2 bg-success hover:bg-success/90 text-white"
        >
          <CheckCircle2 className="size-4" /> Mark complete
        </Button>
        <Button
          type="button"
          onClick={() => setConfirmCancel(true)}
          variant="outline"
          className="gap-2 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
        >
          <XCircle className="size-4" /> Cancel session
        </Button>
      </div>

      {confirmComplete && (
        <PortalModal onClose={() => setConfirmComplete(false)} title="Mark session complete?" tone="success">
          <p className="text-sm text-muted-foreground">
            Make sure attendance has been recorded first. This locks the session.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmComplete(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={doComplete} disabled={isPending} className="gap-2 bg-success hover:bg-success/90 text-white">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirm complete
            </Button>
          </div>
        </PortalModal>
      )}

      {confirmCancel && (
        <PortalModal onClose={() => setConfirmCancel(false)} title="Cancel this session?" tone="danger">
          <p className="text-sm text-muted-foreground">
            Notifies enrolled families and adjusts charges. Pay-now bookings get credits; pay-later bookings have upcoming charges removed.
          </p>
          <div className="mt-4">
            <Label htmlFor="cancel-reason">Cancellation reason</Label>
            <Textarea
              id="cancel-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Rain, coach unavailable…"
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmCancel(false)} disabled={isPending}>
              Keep session
            </Button>
            <Button type="button" onClick={doCancel} disabled={isPending || !reason.trim()} variant="destructive" className="gap-2">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              Confirm cancellation
            </Button>
          </div>
        </PortalModal>
      )}
    </>
  )
}

function PortalModal({
  children,
  onClose,
  title,
  tone,
}: {
  children: React.ReactNode
  onClose: () => void
  title: string
  tone: 'success' | 'danger'
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  const accent = tone === 'success' ? 'border-success/30' : 'border-danger/30'

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border ${accent} bg-popover shadow-elevated animate-slide-up max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        <div className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
