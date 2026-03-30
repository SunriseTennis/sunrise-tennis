'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Search, Loader2, MapPin } from 'lucide-react'
import { savePlayerUTR } from '@/app/(dashboard)/admin/competitions/actions'

interface UTRResult {
  id: string
  displayName: string
  ageRange: string | null
  location: string | null
  threeMonthRating: number | null
  singlesUtrDisplay: string | null
  ratingStatusSingles: string | null
}

export function UTRSearch({
  competitionId,
  teamId,
  compPlayerId,
  playerName,
}: {
  competitionId: string
  teamId: string
  compPlayerId: string
  playerName: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<UTRResult[]>([])
  const [searched, setSearched] = useState(false)

  async function handleSearch() {
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/utr/search?q=${encodeURIComponent(playerName)}&top=5`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.results ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="xs" onClick={() => { setOpen(true); handleSearch() }}>
        <Search className="size-3" />
        UTR
      </Button>
    )
  }

  return (
    <div className="min-w-[250px]">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Searching UTR...
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-xs text-muted-foreground">No UTR results found</p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-1">
          {results.map((r) => (
            <form key={r.id} action={savePlayerUTR.bind(null, competitionId, teamId, compPlayerId)}>
              <input type="hidden" name="utr_profile_id" value={r.id} />
              <input type="hidden" name="utr_rating_display" value={r.threeMonthRating?.toString() ?? r.singlesUtrDisplay ?? ''} />
              <input type="hidden" name="utr_rating_status" value={r.ratingStatusSingles ?? ''} />
              <button
                type="submit"
                className="flex w-full items-start gap-2 rounded-md p-1.5 text-left text-xs hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.displayName}</p>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {r.ageRange && <span>{r.ageRange}</span>}
                    {r.location && (
                      <span className="inline-flex items-center gap-0.5 truncate">
                        <MapPin className="size-2.5 shrink-0" />
                        {r.location}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {r.threeMonthRating ? (
                    <span className="font-mono font-medium">{r.threeMonthRating}</span>
                  ) : (
                    <span className="text-muted-foreground">{r.ratingStatusSingles}</span>
                  )}
                </div>
              </button>
            </form>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
