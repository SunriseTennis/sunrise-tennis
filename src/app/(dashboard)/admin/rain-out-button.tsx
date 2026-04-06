'use client'

import { useState } from 'react'
import { CloudRain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rainOutToday } from './actions'

export function RainOutButton({ todaySessionCount }: { todaySessionCount: number }) {
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
      >
        <CloudRain className="size-4" />
        Rain Out Today ({todaySessionCount} session{todaySessionCount !== 1 ? 's' : ''})
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <CloudRain className="size-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-900">
          Cancel all {todaySessionCount} scheduled session{todaySessionCount !== 1 ? 's' : ''} today?
        </p>
        <p className="text-xs text-amber-700">
          All enrolled families will be notified. Pre-paid sessions will be credited.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true)
            const formData = new FormData()
            await rainOutToday()
          }}
        >
          {submitting ? 'Cancelling...' : 'Confirm Rain Out'}
        </Button>
      </div>
    </div>
  )
}
