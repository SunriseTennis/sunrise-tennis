'use client'

import { cancelSession } from '../../actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function CancelSessionForm({ sessionId }: { sessionId: string }) {
  const cancelWithId = cancelSession.bind(null, sessionId)

  return (
    <details className="rounded-xl border border-danger/30 bg-card">
      <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-danger">
        Cancel this session
      </summary>
      <form action={cancelWithId} className="space-y-4 px-6 pb-6">
        <div>
          <Label htmlFor="reason">
            Cancellation reason
          </Label>
          <Textarea
            id="reason"
            name="reason"
            rows={2}
            placeholder="e.g. Rain, coach unavailable..."
            className="mt-1"
          />
        </div>
        <Button type="submit" variant="destructive">
          Confirm cancellation
        </Button>
      </form>
    </details>
  )
}
