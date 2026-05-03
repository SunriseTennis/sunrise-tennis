'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Eye, Search } from 'lucide-react'
import Link from 'next/link'

interface PlayerRow {
  player_id: string
  player_name: string
  family_id: string
  family_display_id: string
  family_name: string
  /** All allowed coaches for the player. Empty array = no restriction. */
  allowed: { coach_id: string; coach_name: string; auto_approve: boolean }[]
}

export function AllowedCoachesOverview({ rows }: { rows: PlayerRow[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.player_name.toLowerCase().includes(q) ||
      r.family_name.toLowerCase().includes(q) ||
      r.family_display_id.toLowerCase().includes(q) ||
      r.allowed.some(a => a.coach_name.toLowerCase().includes(q)),
    )
  }, [rows, search])

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Eye className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Allowed Coaches Overview</h2>
            <p className="text-xs text-muted-foreground">Per-player view. Empty = no restriction (any coach).</p>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search player, family, or coach…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-12 gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-3">Player</div>
            <div className="col-span-3">Family</div>
            <div className="col-span-6">Allowed coaches</div>
          </div>
          <div className="divide-y divide-border/60">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No players match your search.</p>
            ) : filtered.map(r => (
              <div key={r.player_id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                <div className="col-span-3 font-medium text-foreground">{r.player_name}</div>
                <div className="col-span-3 text-muted-foreground">
                  <Link
                    href={`/admin/families/${r.family_id}`}
                    className="hover:underline"
                  >
                    {r.family_name}
                  </Link>
                  <span className="ml-1 text-[11px] text-muted-foreground/70">{r.family_display_id}</span>
                </div>
                <div className="col-span-6">
                  {r.allowed.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No restriction (any coach)</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.allowed.map(a => (
                        <span
                          key={a.coach_id}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${a.auto_approve ? 'bg-success/15 text-success' : 'bg-muted text-foreground'}`}
                          title={a.auto_approve ? 'Auto-approved' : 'Requires admin approval'}
                        >
                          {a.coach_name}{a.auto_approve && <span className="text-[10px]">✓</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Showing {filtered.length} of {rows.length} active player{rows.length === 1 ? '' : 's'}.
        </p>
      </CardContent>
    </Card>
  )
}
