'use client'

/**
 * Shared cancel-session reason picker. Used by:
 *   - calendar popup (per-session cancel)
 *   - /admin "Cancel Today" bulk action
 *   - /admin/programs/[id]/sessions/[sessionId] page header
 *   - /admin/sessions/[sessionId] legacy session detail page
 *
 * Pure presentational — caller passes `onConfirm({ category, reason })` and
 * is responsible for wrapping the action call in startTransition / handling
 * any redirect.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloudRain, Flame, HelpCircle, Loader2, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'

export type CancellationCategory = 'rain_out' | 'heat_out' | 'other'

const OPTIONS: { value: CancellationCategory; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'rain_out', label: 'Rain out',   icon: <CloudRain className="size-4" />, hint: 'Weather forced the cancellation.' },
  { value: 'heat_out', label: 'Heat out',   icon: <Flame className="size-4" />,     hint: 'Extreme heat — courts closed or unsafe.' },
  { value: 'other',    label: 'Other',       icon: <HelpCircle className="size-4" />, hint: 'Type a short reason.' },
]

export function CancelSessionModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = 'Confirm cancellation',
  isPending,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  confirmLabel?: string
  isPending: boolean
  onConfirm: (payload: { category: CancellationCategory; reason: string }) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [category, setCategory] = useState<CancellationCategory | null>(null)
  const [otherReason, setOtherReason] = useState('')

  useEffect(() => { setMounted(true) }, [])

  // Reset state when the modal closes so reopening is clean.
  useEffect(() => {
    if (!open) {
      setCategory(null)
      setOtherReason('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted || !open) return null

  const otherTrimmed = otherReason.trim()
  const valid = category === 'rain_out' || category === 'heat_out' || (category === 'other' && otherTrimmed.length > 0)

  function submit() {
    if (!valid || !category) return
    onConfirm({
      category,
      reason: category === 'other' ? otherTrimmed : '',
    })
  }

  return createPortal(
    <div
      // data-popup-overlay tells <WeeklyCalendar>'s document-mousedown
      // outside-click handler to treat this modal as an extension of the
      // popup (the calendar popup opens this modal; both are portaled to
      // body, so without this opt-in any click inside this reason picker
      // would close the popup that opened it).
      data-popup-overlay
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-danger/30 bg-popover shadow-elevated animate-slide-up max-h-[85vh] overflow-y-auto"
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
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>

          <fieldset className="mt-5 space-y-2">
            <legend className="sr-only">Cancellation reason</legend>
            {OPTIONS.map((opt) => {
              const active = category === opt.value
              return (
                <label
                  key={opt.value}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors cursor-pointer',
                    active
                      ? 'border-danger/60 bg-danger/5 ring-1 ring-danger/40'
                      : 'border-border hover:border-danger/30 hover:bg-danger/[0.02]',
                  )}
                >
                  <input
                    type="radio"
                    name="cancellation_category"
                    value={opt.value}
                    checked={active}
                    onChange={() => setCategory(opt.value)}
                    className="mt-0.5 size-4 accent-danger"
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className={cn('text-muted-foreground', active && 'text-danger')}>{opt.icon}</span>
                      {opt.label}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{opt.hint}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>

          {category === 'other' && (
            <div className="mt-3">
              <Label htmlFor="cancel-other-reason">Reason</Label>
              <Input
                id="cancel-other-reason"
                type="text"
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="e.g. Coach unavailable, court flooding..."
                className="mt-1"
                autoFocus
                maxLength={300}
              />
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Keep session
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={!valid || isPending}
              variant="destructive"
              className="gap-2"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
