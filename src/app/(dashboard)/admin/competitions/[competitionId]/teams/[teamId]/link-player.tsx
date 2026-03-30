'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LinkIcon } from 'lucide-react'
import { updateCompPlayer } from '@/app/(dashboard)/admin/competitions/actions'

interface FamilyPlayer {
  id: string
  first_name: string
  last_name: string | null
  families: { family_name: string } | null
}

export function LinkPlayer({
  competitionId,
  teamId,
  compPlayerId,
  playerName,
  familyPlayers,
}: {
  competitionId: string
  teamId: string
  compPlayerId: string
  playerName: string
  familyPlayers: FamilyPlayer[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(playerName)

  const filtered = familyPlayers.filter((p) => {
    const fullName = `${p.first_name} ${p.last_name ?? ''}`.toLowerCase()
    return fullName.includes(search.toLowerCase())
  })

  if (!open) {
    return (
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <LinkIcon className="size-3" />
        Link
      </Button>
    )
  }

  return (
    <div className="min-w-[220px]">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players..."
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
        autoFocus
      />

      {filtered.length > 0 ? (
        <div className="mt-1 max-h-[150px] overflow-y-auto space-y-0.5">
          {filtered.slice(0, 8).map((p) => {
            const family = p.families as unknown as { family_name: string } | null
            return (
              <form
                key={p.id}
                action={updateCompPlayer.bind(null, competitionId, teamId, compPlayerId)}
              >
                <input type="hidden" name="player_id" value={p.id} />
                {/* Pass through required fields to satisfy validation */}
                <input type="hidden" name="first_name" value={p.first_name} />
                <input type="hidden" name="last_name" value={p.last_name ?? ''} />
                <input type="hidden" name="role" value="mainstay" />
                <input type="hidden" name="registration_status" value="registered" />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-md p-1.5 text-left text-xs hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{p.first_name} {p.last_name}</span>
                  {family && (
                    <span className="text-muted-foreground">{family.family_name}</span>
                  )}
                </button>
              </form>
            )
          })}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No matching players</p>
      )}

      <button
        onClick={() => setOpen(false)}
        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  )
}
