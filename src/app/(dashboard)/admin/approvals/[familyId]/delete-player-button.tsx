'use client'

/**
 * Plan 21 — small "Delete player" button with inline confirm. Two
 * clicks: first reveals the confirmation prompt, second submits to
 * `deletePlayer`. Used in the approvals queue + admin family detail
 * pages where deleting a player is a tiny action next to Edit.
 *
 * If the RPC blocks the delete (player has FK dependents), the
 * server action redirects with `?error=...`; the page shows the
 * banner. No client-side blocker handling needed.
 */

import { useState, useTransition } from 'react'
import { Trash2, X } from 'lucide-react'
import { deletePlayer } from '../../actions'

interface Props {
  playerId: string
  familyId: string
  playerName: string
  /** Where the action should redirect on success/error. */
  returnTo: 'approvals' | 'family' | 'player'
}

export function DeletePlayerButton({ playerId, familyId, playerName, returnTo }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deletePlayer(playerId, familyId, returnTo)
    })
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        title={`Delete ${playerName}`}
      >
        <Trash2 className="size-3" />
        Delete
      </button>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-destructive bg-destructive px-2.5 py-1.5 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
      >
        <Trash2 className="size-3" />
        {pending ? 'Deleting…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        title="Cancel"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
