import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push/send'
import { formatTime } from '@/lib/utils/dates'

/**
 * Cron: Session Reminders
 * Runs daily at ~7pm ACDT. Finds tomorrow's confirmed private sessions
 * and sends push reminders to parents.
 *
 * Vercel Cron: schedule in vercel.json as "0 8 * * *" (8:00 UTC = ~6:30pm ACST / 7:00pm ACDT)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Tomorrow's date
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // Find confirmed private sessions for tomorrow
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, date, start_time, coach_id, coaches:coach_id(name)')
    .eq('date', tomorrowStr)
    .eq('session_type', 'private')
    .eq('status', 'scheduled')

  if (!sessions?.length) {
    return NextResponse.json({ message: 'No sessions tomorrow', count: 0 })
  }

  let notified = 0

  for (const session of sessions) {
    // Get the booking to find the family
    const { data: booking } = await supabase
      .from('bookings')
      .select('family_id, player_id, players:player_id(first_name)')
      .eq('session_id', session.id)
      .eq('status', 'confirmed')
      .single()

    if (!booking) continue

    // Get parent user IDs for this family
    const { data: parentRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('family_id', booking.family_id)
      .eq('role', 'parent')

    const coachName = (session.coaches as unknown as { name: string } | null)?.name ?? 'coach'
    const playerName = (booking.players as unknown as { first_name: string } | null)?.first_name ?? 'your child'

    for (const role of parentRoles ?? []) {
      try {
        await sendPushToUser(role.user_id, {
          title: 'Session Tomorrow',
          body: `${playerName} has a private lesson with ${coachName} at ${session.start_time ? formatTime(session.start_time) : 'TBD'}`,
          url: '/parent/bookings',
        })
        notified++
      } catch { /* continue */ }
    }
  }

  return NextResponse.json({ message: `Sent ${notified} reminders`, count: notified })
}
