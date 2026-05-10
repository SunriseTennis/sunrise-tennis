'use client'

import { useState, useTransition } from 'react'
import { addWalkInPlayer } from '../../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus, Loader2 } from 'lucide-react'

type PlayerResult = {
  id: string
  first_name: string
  last_name: string
  classifications: string[] | null
}

export function AddPlayerForm({
  sessionId,
  existingPlayerIds,
}: {
  sessionId: string
  existingPlayerIds: string[]
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [searching, setSearching] = useState(false)
  const [chargeEnabled, setChargeEnabled] = useState(true)
  const [isPending, startTransition] = useTransition()

  async function handleSearch(q: string) {
    setQuery(q)
    if (q.length < 2) {
      setResults([])
      return
    }

    setSearching(true)
    try {
      const { searchPlayersForCoach } = await import('../../actions')
      const data = await searchPlayersForCoach(q)
      // Plan 24 — RPC return shape changed (ball_color → classifications) but
      // generated supabase types haven't been regenerated yet, so we cast.
      const rows = (data ?? []) as unknown as PlayerResult[]
      // Filter out players already in the session
      setResults(rows.filter((p) => !existingPlayerIds.includes(p.id)))
    } finally {
      setSearching(false)
    }
  }

  function handleAdd(playerId: string) {
    startTransition(async () => {
      await addWalkInPlayer(sessionId, playerId, chargeEnabled)
    })
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-2">Add Walk-in Player</h3>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by player name..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={chargeEnabled}
            onChange={(e) => setChargeEnabled(e.target.checked)}
            className="rounded"
          />
          Charge for session
        </label>
      </div>

      {searching && (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Searching...
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-2 space-y-1 rounded-lg border border-border divide-y divide-border">
          {results.map((player) => (
            <div key={player.id} className="flex items-center justify-between px-3 py-2">
              <div>
                <span className="text-sm font-medium text-foreground">
                  {player.first_name} {player.last_name}
                </span>
                {(player.classifications ?? []).length > 0 && (
                  <span className="ml-2 text-xs capitalize text-muted-foreground">{(player.classifications ?? []).join(' / ')}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => handleAdd(player.id)}
              >
                {isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                Add
              </Button>
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No players found.</p>
      )}
    </div>
  )
}
