import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push/send'
import { formatTime } from '@/lib/utils/dates'
import { fetchUserPrefs } from '@/lib/notifications/preferences'

/**
 * Cron: Session Reminders
 * Runs daily at ~7pm ACDT. Finds tomorrow's sessions (private + group)
 * and sends push reminders to parents based on their notification preferences.
 *
 * Preferences (Plan 22):
 *   1. Per-user (master toggle): user_notification_preferences.prefs.push.reminder.
 *      Explicit `false` skips that parent regardless of family 4-way setting.
 *   2. Family 4-way (sub-control, applies when user pref is missing or true):
 *      "all"                       all sessions
 *      "first_week_and_privates"   privates + first week of new enrolment (default)
 *      "privates_only"             private sessions only
 *      "off"                       no reminders
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

  let notified = 0

  // ── Private session reminders ──────────────────────────────────────────
  const { data: privateSessions } = await supabase
    .from('sessions')
    .select('id, date, start_time, coach_id, coaches:coach_id(name)')
    .eq('date', tomorrowStr)
    .eq('session_type', 'private')
    .eq('status', 'scheduled')

  for (const session of privateSessions ?? []) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('family_id, player_id, players:player_id(first_name)')
      .eq('session_id', session.id)
      .eq('status', 'confirmed')
      .single()

    if (!booking) continue

    // Family 4-way (privates are sent in all modes except 'off').
    const { data: family } = await supabase
      .from('families')
      .select('notification_preferences')
      .eq('id', booking.family_id)
      .single()

    const familyPref = (family?.notification_preferences as Record<string, string> | null)?.session_reminders ?? 'first_week_and_privates'
    if (familyPref === 'off') continue

    const { data: parentRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('family_id', booking.family_id)
      .eq('role', 'parent')
    const parentIds = (parentRoles ?? []).map((r) => r.user_id as string)

    // Plan 22 per-user gate: explicit false skips that parent.
    const prefsByUser = await fetchUserPrefs(supabase, parentIds)

    const coachName = (session.coaches as unknown as { name: string } | null)?.name ?? 'coach'
    const playerName = (booking.players as unknown as { first_name: string } | null)?.first_name ?? 'your child'

    for (const uid of parentIds) {
      const userExplicit = prefsByUser.get(uid)?.push?.reminder
      if (userExplicit === false) continue   // user opted out
      try {
        await sendPushToUser(uid, {
          title: 'Session Tomorrow',
          body: `${playerName} has a private lesson with ${coachName} at ${session.start_time ? formatTime(session.start_time) : 'TBD'}`,
          url: '/parent/bookings',
        })
        notified++
      } catch { /* continue */ }
    }
  }

  // ── Group session reminders ────────────────────────────────────────────
  const { data: groupSessions } = await supabase
    .from('sessions')
    .select('id, date, start_time, program_id, programs:program_id(name, type)')
    .eq('date', tomorrowStr)
    .in('session_type', ['group', 'squad', 'school', 'competition'])
    .eq('status', 'scheduled')

  for (const session of groupSessions ?? []) {
    // Find enrolled players for this program
    const { data: roster } = await supabase
      .from('program_roster')
      .select('player_id, enrolled_at, players:player_id(first_name, family_id)')
      .eq('program_id', session.program_id!)
      .eq('status', 'enrolled')

    if (!roster?.length) continue

    // Group by family to avoid duplicate notifications
    const familyMap = new Map<string, { playerNames: string[]; enrolledAt: string }>()
    for (const entry of roster) {
      const player = entry.players as unknown as { first_name: string; family_id: string } | null
      if (!player?.family_id) continue

      const existing = familyMap.get(player.family_id)
      if (existing) {
        existing.playerNames.push(player.first_name)
        // Keep earliest enrolled_at for first-week check
        if (entry.enrolled_at && entry.enrolled_at < existing.enrolledAt) {
          existing.enrolledAt = entry.enrolled_at
        }
      } else {
        familyMap.set(player.family_id, {
          playerNames: [player.first_name],
          enrolledAt: entry.enrolled_at ?? '',
        })
      }
    }

    const programName = (session.programs as unknown as { name: string; type: string } | null)?.name ?? 'Group Session'

    for (const [familyId, info] of familyMap) {
      // Family 4-way sub-control.
      const { data: family } = await supabase
        .from('families')
        .select('notification_preferences')
        .eq('id', familyId)
        .single()

      const familyPref = (family?.notification_preferences as Record<string, string> | null)?.session_reminders ?? 'first_week_and_privates'

      if (familyPref === 'off' || familyPref === 'privates_only') continue

      if (familyPref === 'first_week_and_privates') {
        // Only send if enrolled within the last 7 days (first week)
        if (info.enrolledAt) {
          const enrolledDate = new Date(info.enrolledAt)
          const daysSinceEnrolled = (tomorrow.getTime() - enrolledDate.getTime()) / (1000 * 60 * 60 * 24)
          if (daysSinceEnrolled > 7) continue
        } else {
          continue // No enrolled_at = not first week
        }
      }

      // familyPref === 'all' always gets through

      const { data: parentRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('family_id', familyId)
        .eq('role', 'parent')
      const parentIds = (parentRoles ?? []).map((r) => r.user_id as string)

      // Plan 22 per-user gate.
      const prefsByUser = await fetchUserPrefs(supabase, parentIds)

      const playerList = info.playerNames.join(' & ')

      for (const uid of parentIds) {
        const userExplicit = prefsByUser.get(uid)?.push?.reminder
        if (userExplicit === false) continue   // user opted out
        try {
          await sendPushToUser(uid, {
            title: 'Session Tomorrow',
            body: `${playerList} ${info.playerNames.length > 1 ? 'have' : 'has'} ${programName} at ${session.start_time ? formatTime(session.start_time) : 'TBD'}`,
            url: '/parent/programs',
          })
          notified++
        } catch { /* continue */ }
      }
    }
  }

  return NextResponse.json({ message: `Sent ${notified} reminders`, count: notified })
}
