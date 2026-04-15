import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push/send'

/**
 * Cron: Pre-Charge Heads-Up
 * Runs daily. Finds sessions & private bookings 10 days out and sends a push
 * notification + in-platform notification row to each affected family, so a
 * charge never lands in family_balance without prior warning.
 *
 * Preference: families.notification_preferences.pre_charge_heads_up (bool, default true).
 * Idempotency: skip families who already got a pre_charge notification in the last 14 days.
 *
 * Vercel Cron: "0 9 * * *" (daily).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Target date: exactly 10 days from today
  const target = new Date()
  target.setDate(target.getDate() + 10)
  const targetStr = target.toISOString().split('T')[0]

  // Collect affected family IDs from both group sessions and private bookings on target date.
  const familyIds = new Set<string>()

  // Group sessions → players enrolled → families
  const { data: groupSessions } = await supabase
    .from('sessions')
    .select('id, program_id')
    .eq('date', targetStr)
    .in('session_type', ['group', 'squad', 'school', 'competition'])
    .eq('status', 'scheduled')

  const programIds = [...new Set((groupSessions ?? []).map(s => s.program_id).filter(Boolean))] as string[]

  if (programIds.length > 0) {
    const { data: roster } = await supabase
      .from('program_roster')
      .select('players:player_id(family_id)')
      .in('program_id', programIds)
      .eq('status', 'enrolled')

    for (const entry of roster ?? []) {
      const fid = (entry.players as unknown as { family_id: string } | null)?.family_id
      if (fid) familyIds.add(fid)
    }
  }

  // Private bookings for sessions on target date
  const { data: privateSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('date', targetStr)
    .eq('session_type', 'private')
    .eq('status', 'scheduled')

  const privateSessionIds = (privateSessions ?? []).map(s => s.id)
  if (privateSessionIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('family_id')
      .in('session_id', privateSessionIds)
      .eq('status', 'confirmed')

    for (const b of bookings ?? []) {
      if (b.family_id) familyIds.add(b.family_id)
    }
  }

  if (familyIds.size === 0) {
    return NextResponse.json({ message: 'No upcoming charges 10 days out', count: 0 })
  }

  let notified = 0
  let skipped = 0

  for (const familyId of familyIds) {
    // Preference check
    const { data: family } = await supabase
      .from('families')
      .select('notification_preferences')
      .eq('id', familyId)
      .single()

    const prefs = family?.notification_preferences as Record<string, unknown> | null
    const enabled = prefs?.pre_charge_heads_up !== false
    if (!enabled) { skipped++; continue }

    // Idempotency: skip if a pre_charge notification was already sent in last 14 days
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const { data: recent } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'pre_charge')
      .eq('target_type', 'family')
      .eq('target_id', familyId)
      .gte('sent_at', fourteenDaysAgo.toISOString())
      .limit(1)

    if (recent && recent.length > 0) { skipped++; continue }

    const title = 'Heads-up: upcoming charge'
    const body = 'Sessions in ~10 days will add charges to your family balance. Tap to review.'
    const url = '/parent/payments'

    // Insert in-platform notification row
    await supabase.from('notifications').insert({
      type: 'pre_charge',
      title,
      body,
      url,
      target_type: 'family',
      target_id: familyId,
    })

    // Resolve parent user_ids and send push
    const { data: parentRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('family_id', familyId)
      .eq('role', 'parent')

    for (const role of parentRoles ?? []) {
      try {
        await sendPushToUser(role.user_id, { title, body, url })
      } catch { /* continue */ }
    }

    notified++
  }

  return NextResponse.json({
    message: `Notified ${notified} families (skipped ${skipped})`,
    count: notified,
    skipped,
  })
}
