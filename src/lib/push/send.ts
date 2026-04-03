/**
 * Server-side push notification sending utility.
 * Uses web-push to send notifications to push subscriptions.
 */

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:foundationtennis@hotmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  )
}

interface PushPayload {
  title: string
  body: string
  url?: string
}

interface SubscriptionRecord {
  id: string
  user_id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Send push to a single subscription. Returns false if subscription is stale (410 Gone).
 */
export async function sendPushToSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
    )
    return true
  } catch (err: unknown) {
    const error = err as { statusCode?: number }
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription expired or invalid - clean up
      const supabase = getServiceClient()
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', subscription.endpoint)
      return false
    }
    console.error('Push send failed:', err instanceof Error ? err.message : 'Unknown error')
    return false
  }
}

/**
 * Send push notification to all subscriptions for a specific user.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const supabase = getServiceClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, keys')
    .eq('user_id', userId)

  if (!subs?.length) return

  await Promise.allSettled(
    subs.map((sub) =>
      sendPushToSubscription(
        { endpoint: sub.endpoint, keys: sub.keys as unknown as { p256dh: string; auth: string } },
        payload,
      ),
    ),
  )
}

/**
 * Get all admin user IDs (for notifications).
 */
export async function getAdminUserIds(): Promise<string[]> {
  const supabase = getServiceClient()
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
  return roles?.map(r => r.user_id) ?? []
}

/**
 * Send push notification to all admin users.
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  const adminIds = await getAdminUserIds()
  await Promise.allSettled(adminIds.map(uid => sendPushToUser(uid, payload)))
}

/**
 * Resolve notification target to user IDs and send push notifications.
 * Returns list of user_ids that were notified.
 */
export async function sendNotificationToTarget(params: {
  title: string
  body: string
  url?: string
  targetType: string
  targetId?: string
  targetLevel?: string
}): Promise<string[]> {
  const supabase = getServiceClient()
  const { title, body, url, targetType, targetId, targetLevel } = params
  const payload: PushPayload = { title, body, url }

  let userIds: string[] = []

  if (targetType === 'all') {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id')
    userIds = [...new Set(subs?.map((s) => s.user_id) ?? [])]
  } else if (targetType === 'family' && targetId) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('family_id', targetId)
      .eq('role', 'parent')
    userIds = roles?.map((r) => r.user_id) ?? []
  } else if (targetType === 'program' && targetId) {
    // Find players in program -> their families -> parent users
    const { data: roster } = await supabase
      .from('program_roster')
      .select('player_id, players:player_id(family_id)')
      .eq('program_id', targetId)
      .eq('status', 'enrolled')

    const familyIds = [...new Set(
      roster?.map((r) => (r.players as unknown as { family_id: string })?.family_id).filter(Boolean) ?? [],
    )]

    if (familyIds.length > 0) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'parent')
        .in('family_id', familyIds)
      userIds = roles?.map((r) => r.user_id) ?? []
    }
  } else if (targetType === 'level' && targetLevel) {
    // Find players with this ball color -> families -> parent users
    const { data: players } = await supabase
      .from('players')
      .select('family_id')
      .eq('ball_color', targetLevel)
      .eq('status', 'active')

    const familyIds = [...new Set(players?.map((p) => p.family_id) ?? [])]

    if (familyIds.length > 0) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'parent')
        .in('family_id', familyIds)
      userIds = roles?.map((r) => r.user_id) ?? []
    }
  } else if (targetType === 'team' && targetId) {
    // Find team members -> players -> families -> parent users
    const { data: members } = await supabase
      .from('team_members')
      .select('player_id, players:player_id(family_id)')
      .eq('team_id', targetId)

    const familyIds = [...new Set(
      members?.map((m) => (m.players as unknown as { family_id: string })?.family_id).filter(Boolean) ?? [],
    )]

    if (familyIds.length > 0) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'parent')
        .in('family_id', familyIds)
      userIds = roles?.map((r) => r.user_id) ?? []
    }
  }

  // Send push to all resolved users
  await Promise.allSettled(userIds.map((uid) => sendPushToUser(uid, payload)))

  return userIds
}
