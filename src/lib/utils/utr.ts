/**
 * UTR (Universal Tennis Rating) search via the public web app API.
 *
 * The search endpoint at app.universaltennis.com does not require
 * authentication for player lookups. No API key or login needed.
 */

export interface UTRSearchResult {
  id: string
  displayName: string
  ageRange: string | null
  location: string | null
  threeMonthRating: number | null
  singlesUtrDisplay: string | null
  ratingStatusSingles: string | null
}

export async function searchUTRPlayers(
  query: string,
  top: number = 5,
): Promise<UTRSearchResult[]> {
  // Use utrsports.net directly — app.universaltennis.com 301-redirects here,
  // and Next.js cached fetch doesn't follow redirects properly on Vercel.
  const res = await fetch(
    `https://app.utrsports.net/api/v2/search/players?query=${encodeURIComponent(query)}&top=${top}`,
    {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    },
  )

  if (!res.ok) {
    throw new Error(`UTR search failed (${res.status})`)
  }

  const data = await res.json()

  return (data.hits ?? []).map((hit: Record<string, unknown>) => {
    const s = hit.source as Record<string, unknown>
    const loc = s.location as Record<string, unknown> | null
    return {
      id: String(s.id),
      displayName: (s.displayName ?? '') as string,
      ageRange: (s.ageRange ?? null) as string | null,
      location: (loc?.display ?? null) as string | null,
      threeMonthRating: (s.threeMonthRating ?? null) as number | null,
      singlesUtrDisplay: (s.singlesUtrDisplay ?? null) as string | null,
      ratingStatusSingles: (s.ratingStatusSingles ?? null) as string | null,
    }
  })
}
