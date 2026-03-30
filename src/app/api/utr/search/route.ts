import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`utr:${user.id}`, 15, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Query too short' }, { status: 400 })
  }

  const top = Math.min(parseInt(request.nextUrl.searchParams.get('top') ?? '5', 10), 10)

  try {
    const res = await fetch(
      `https://api.universaltennis.com/v2/search/players?query=${encodeURIComponent(q)}&top=${top}`,
      { headers: { 'Accept': 'application/json' }, next: { revalidate: 300 } },
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'UTR API error' }, { status: 502 })
    }

    const data = await res.json()

    const results = (data.hits ?? []).map((hit: Record<string, unknown>) => {
      const s = hit.source as Record<string, unknown>
      const loc = s.location as Record<string, unknown> | null
      return {
        id: String(s.id),
        displayName: s.displayName ?? '',
        ageRange: s.ageRange ?? null,
        location: loc?.display ?? null,
        threeMonthRating: s.threeMonthRating ?? null,
        singlesUtrDisplay: s.singlesUtrDisplay ?? null,
        ratingStatusSingles: s.ratingStatusSingles ?? null,
      }
    })

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Failed to reach UTR' }, { status: 502 })
  }
}
