import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { endpoint, keys } = await request.json()

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
  }

  // Check if this endpoint already exists for this user
  const { data: existing } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
    .single()

  if (existing) {
    // Update keys in case they changed
    await supabase
      .from('push_subscriptions')
      .update({ keys })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('push_subscriptions')
      .insert({
        user_id: user.id,
        endpoint,
        keys,
      })
  }

  return NextResponse.json({ ok: true })
}
