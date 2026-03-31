import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'
import { searchUTRPlayers } from '@/lib/utils/utr'

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
    const results = await searchUTRPlayers(q, top)
    return NextResponse.json({ results })
  } catch (e) {
    console.error('UTR search error:', e instanceof Error ? e.message : 'Unknown error')
    return NextResponse.json({ error: 'UTR search failed' }, { status: 502 })
  }
}
