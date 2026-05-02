'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { unenrolFromProgram } from '../actions'
import { UserMinus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UnenrolButton({
  programId,
  playerId,
  playerName,
  programName,
  remainingSessions,
}: {
  programId: string
  playerId: string
  playerName: string
  programName: string
  remainingSessions: number
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleUnenrol() {
    setLoading(true)
    setError(null)
    const result = await unenrolFromProgram(programId, playerId)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setShowConfirm(false)
      router.refresh()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="ml-auto inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/5 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 transition-colors"
      >
        <UserMinus className="size-3" />
        Unenrol
      </button>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up rounded-t-2xl sm:rounded-2xl bg-popover p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Unenrol {playerName}?</h3>
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              This will remove <strong>{playerName}</strong> from <strong>{programName}</strong>.
            </p>
            {remainingSessions > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {remainingSessions} future session charge{remainingSessions !== 1 ? 's' : ''} will be voided.
              </p>
            )}

            {error && (
              <p className="mt-3 text-sm text-danger">{error}</p>
            )}

            <div className="mt-5 flex gap-3 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)} disabled={loading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleUnenrol}
                disabled={loading}
              >
                {loading ? 'Unenrolling...' : 'Unenrol'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
