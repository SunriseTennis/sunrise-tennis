import { NextRequest, NextResponse } from 'next/server'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { getVoucherFileUrl } from '@/lib/utils/storage'

export async function GET(request: NextRequest) {
  await requireAdmin()

  const path = request.nextUrl.searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  const supabase = await createClient()
  const url = await getVoucherFileUrl(supabase, path)

  if (!url) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  return NextResponse.redirect(url)
}
