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
  ball_color: string | null
  classifications: string[]
  track: string | null
  /** All allowed coaches for the player. Empty array = no restriction. */
  allowed: { coach_id: string; coach_name: string; auto_approve: boolean }[]
}

const BALL_COLOR_TINT: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800',
  red: 'bg-red-100 text-red-800',
  orange: 'bg-orange-100 text-orange-800',
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  advanced: 'bg-purple-100 text-purple-800',
  elite: 'bg-amber-100 text-amber-800',
  competitive: 'bg-indigo-100 text-indigo-800',
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface OptInCoach { id: string; name: string }

export function AllowedCoachesOverview({
  rows,
  optInOnlyCoaches = [],
}: {
  rows: PlayerRow[]
  /** Coaches with `private_opt_in_required = true` — excluded from open-access players. */
  optInOnlyCoaches?: OptInCoach[]
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.player_name.toLowerCase().includes(q) ||
      r.family_name.toLowerCase().includes(q) ||
      r.family_display_id.toLowerCase().includes(q) ||
      (r.ball_color ?? '').toLowerCase().includes(q) ||
      (r.track ?? '').toLowerCase().includes(q) ||
      r.classifications.some(c => c.toLowerCase().includes(q)) ||
      r.allowed.some(a => a.coach_name.toLowerCase().includes(q)) ||
      // Players with no explicit allowlist are still affected by opt-in coaches —
      // searching "Maxim" should also surface players he's excluded from.
      (r.allowed.length === 0 && optInOnlyCoaches.some(c => c.name.toLowerCase().includes(q))),
    )
  }, [rows, search, optInOnlyCoaches])

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
            <div className="col-span-2">Family</div>
            <div className="col-span-2">Class / Track</div>
            <div className="col-span-1">Ball</div>
            <div className="col-span-4">Allowed coaches</div>
          </div>
          <div className="divide-y divide-border/60">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No players match your search.</p>
            ) : filtered.map(r => (
              <div key={r.player_id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                <div className="col-span-3 font-medium text-foreground">{r.player_name}</div>
                <div className="col-span-2 text-muted-foreground">
                  <Link
                    href={`/admin/families/${r.family_id}`}
                    className="hover:underline"
                  >
                    {r.family_name}
                  </Link>
                  <span className="ml-1 text-[11px] text-muted-foreground/70">{r.family_display_id}</span>
                </div>
                <div className="col-span-2">
                  <div className="flex flex-wrap gap-1">
                    {r.classifications.length > 0 ? r.classifications.map(c => (
                      <span key={c} className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                        {titleCase(c)}
                      </span>
                    )) : <span className="text-[11px] text-muted-foreground italic">—</span>}
                    {r.track && (
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] ${r.track === 'performance' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {titleCase(r.track)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-span-1">
                  {r.ball_color ? (
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] ${BALL_COLOR_TINT[r.ball_color] ?? 'bg-muted text-foreground'}`}>
                      {titleCase(r.ball_color)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">—</span>
                  )}
                </div>
                <div className="col-span-4">
                  {(() => {
                    // Players with explicit allow rows: their allowlist already
                    // excludes opt-in coaches by default — render as-is.
                    if (r.allowed.length > 0) {
                      return (
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
                      )
                    }
                    // Empty allowlist: surface any opt-in-only coaches that the
                    // player is therefore EXCLUDED from. Without this, the row
                    // showed a misleading "No restriction (any coach)".
                    if (optInOnlyCoaches.length > 0) {
                      return (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-xs text-muted-foreground italic">Open access — except:</span>
                          {optInOnlyCoaches.map(c => (
                            <span
                              key={c.id}
                              className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning"
                              title="Opt-in only — not visible to this player without an explicit allow row"
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      )
                    }
                    return <span className="text-xs text-muted-foreground italic">No restriction (any coach)</span>
                  })()}
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
