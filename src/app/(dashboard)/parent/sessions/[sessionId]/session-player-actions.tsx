'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markSessionAway, cancelSessionBooking } from '../../programs/actions'

interface Props {
  sessionId: string
  playerId: string
  playerName: string
  /** term_enrolled = mark away (no credit). casual_booked = cancel + void charge. */
  relation: 'term_enrolled' | 'casual_booked'
  /** Latest attendance status: present | absent | away | booked | null. */
  attendanceStatus: string | null
  isPast: boolean
}

export function SessionPlayerActions({
  sessionId,
  playerId,
  playerName,
  relation,
  attendanceStatus,
  isPast,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const isAway = attendanceStatus === 'absent' || attendanceStatus === 'away'
  const isCancelled = attendanceStatus === 'cancelled'

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{playerName}</p>
          <p className="text-xs text-muted-foreground">
            {relation === 'term_enrolled' ? 'Term enrolled' : 'Single session booking'}
            {isAway && ' · Marked away'}
            {isCancelled && ' · Cancelled'}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>
      )}

      {!isCancelled && !isPast && (
        <div className="flex flex-wrap gap-2">
          {relation === 'term_enrolled' && !isAway && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => runAction(() => markSessionAway(sessionId, playerId))}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : 'Mark away'}
            </Button>
          )}

          {relation === 'casual_booked' && !confirming && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(true)}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              Cancel session
            </Button>
          )}

          {relation === 'casual_booked' && confirming && (
            <div className="w-full space-y-2 rounded border border-red-200 bg-red-50/50 p-2">
              <p className="text-xs text-red-800">
                Cancel this session for {playerName}? The charge will be voided.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => runAction(() => cancelSessionBooking(sessionId, playerId))}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : 'Confirm cancel'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
