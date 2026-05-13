'use client'

/**
 * Private session attendance picker.
 *
 * Plan `velvety-whistling-boot` — one consistent UX for marking who attended a
 * private session. Replaces the older `convertSharedToSolo` / "Mark cancelled"
 * shape on every surface (admin overview popup, admin /privates Calendar +
 * Series tabs, admin /admin/sessions/[id] private branch, coach
 * /coach/privates/[sessionId], coach /coach/schedule popup).
 *
 * Semantics (server-side in `markPrivateAttendance`):
 *   - Present       → booking stays; charge confirms at complete.
 *   - Absent        → booking cancelled (excused); charge voided + family credited.
 *   - No-show       → booking cancelled (unexcused); charge KEPT (forfeit).
 *
 * On a shared session with one remaining Present player, a top-up charge is
 * added so the remaining family pays the full solo rate, and a lesson note is
 * auto-created on that player ("Was a private — [partner] did not attend.").
 *
 * The form submits all picks in one call and returns a structured result —
 * no redirect — so it composes inside modals and inline cards.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InlineSegmented } from '@/components/inline-edit/inline-segmented'
import { markPrivateAttendance } from '@/app/(dashboard)/admin/privates/actions'

export type PrivateAttendanceBooking = {
  id: string
  playerId: string
  playerFirstName: string
  playerLastName?: string | null
  familyId: string
  priceCents: number
}

type Mark = 'present' | 'absent' | 'noshow'

export function PrivateAttendanceForm({
  sessionId,
  bookings,
  onSubmitted,
  compact,
}: {
  sessionId: string
  bookings: PrivateAttendanceBooking[]
  /** Called after a successful submit. Parent typically closes the modal + refreshes. */
  onSubmitted?: (result: { converted: boolean; completed: boolean }) => void
  /** Tighter padding when embedded inside an already-spaced surface. */
  compact?: boolean
}) {
  const router = useRouter()
  const [picks, setPicks] = useState<Record<string, Mark>>(() => {
    const init: Record<string, Mark> = {}
    for (const b of bookings) init[b.id] = 'present'
    return init
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function setPick(bookingId: string, mark: Mark) {
    setPicks(prev => ({ ...prev, [bookingId]: mark }))
    setError(null)
    setSuccess(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('session_id', sessionId)
      for (const b of bookings) {
        fd.set(`attendance_${b.id}`, picks[b.id] ?? 'present')
      }
      const res = await markPrivateAttendance(fd)
      if (res.error) {
        setError(res.error)
        return
      }
      const converted = !!res.converted
      const msg = converted
        ? 'Session marked complete. Partner cancelled — top-up charge added to the remaining family.'
        : 'Session marked complete.'
      setSuccess(msg)
      router.refresh()
      if (onSubmitted) onSubmitted({ converted, completed: !!res.completed })
    })
  }

  const allPresent = bookings.every(b => (picks[b.id] ?? 'present') === 'present')
  const submitLabel = allPresent ? 'Mark complete' : 'Confirm attendance'

  return (
    <form
      onSubmit={handleSubmit}
      className={compact ? 'space-y-3' : 'space-y-4'}
    >
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {bookings.map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {b.playerFirstName}{b.playerLastName ? ` ${b.playerLastName}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCents(b.priceCents)}{' '}
                {bookings.length === 1 ? '· solo' : '· shared'}
              </p>
            </div>
            <InlineSegmented<Mark>
              value={picks[b.id] ?? 'present'}
              onChange={(next) => setPick(b.id, next)}
              size="sm"
              disabled={pending}
              options={[
                { value: 'present', label: 'Present', tone: 'success' },
                { value: 'absent',  label: 'Absent',  tone: 'warning' },
                { value: 'noshow',  label: 'No-show', tone: 'danger'  },
              ]}
            />
          </div>
        ))}
      </div>

      {bookings.length === 0 && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No active bookings on this session.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground leading-snug">
        <strong className="text-foreground">Absent</strong> voids the charge (excused, full credit).{' '}
        <strong className="text-foreground">No-show</strong> keeps the charge (unexcused, forfeit).
        {bookings.length > 1 && ' If only one player remains present, the session converts to a solo and a top-up charge is added to the remaining family.'}
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" role="status">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || bookings.length === 0} size="sm">
          {pending ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</> : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
