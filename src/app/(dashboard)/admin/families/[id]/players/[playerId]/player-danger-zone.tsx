'use client'

/**
 * Plan 21 — Player-page danger zone. Single action: hard-delete the
 * player via `admin_delete_player`. Blocked if the player has FK
 * dependents (attendances, charges, lesson notes, etc.) — the action
 * redirects with a banner explaining why and suggesting archive.
 *
 * Two-click confirm flow keeps it simple; if admin is sure, second
 * click submits.
 */

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deletePlayer } from '../../../../actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Props {
  playerId: string
  familyId: string
  playerName: string
}

export function PlayerDangerZone({ playerId, familyId, playerName }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    startTransition(async () => {
      await deletePlayer(playerId, familyId, 'player')
    })
  }

  return (
    <Card className="border-destructive/20">
      <CardContent className="space-y-3 pt-6">
        <div>
          <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Permanently delete {playerName}. Only works when no operational
            records (attendances, charges, lesson notes, bookings) reference
            this player. For players with history, set their status to
            inactive or archived instead.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
          >
            <Trash2 className="mr-1.5 size-4" />
            {pending ? 'Deleting…' : confirming ? 'Confirm delete' : 'Delete player'}
          </Button>
          {confirming && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
