'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Plus, UserPlus } from 'lucide-react'
import { adminAddWalkInAttendance } from '../../../../actions'

type PlayerOption = {
  id: string
  firstName: string
  lastName: string
  familyDisplayId: string
  familyName: string
}

export function WalkInForm({
  sessionId,
  programId,
  candidatePlayers,
}: {
  sessionId: string
  programId: string
  /** All active players NOT already on this session's attendance (roster + existing walk-ins excluded). */
  candidatePlayers: PlayerOption[]
}) {
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as PlayerOption[]
    return candidatePlayers
      .filter(p =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.familyDisplayId.toLowerCase().includes(q) ||
        p.familyName.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [search, candidatePlayers])

  function onAdd(playerId: string) {
    const fd = new FormData()
    fd.set('session_id', sessionId)
    fd.set('program_id', programId)
    fd.set('player_id', playerId)
    startTransition(async () => {
      await adminAddWalkInAttendance(fd)
      router.refresh()
      setSearch('')
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <UserPlus className="size-5 text-primary" /> Add walk-in
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Drop in a player who isn&apos;t on the roster. A charge is created at their family&apos;s effective rate (multi-group + grandfathered overrides apply).
        </p>

        <div className="mt-4">
          <Input
            type="text"
            placeholder="Search by player name or family (e.g. Lily or Smith)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {matches.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border/50">
              {matches.map(p => (
                <button
                  key={p.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => onAdd(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">{p.familyDisplayId} {p.familyName}</p>
                  </div>
                  <Plus className="size-4 shrink-0 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
