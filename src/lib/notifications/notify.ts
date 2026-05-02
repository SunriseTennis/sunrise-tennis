/**
 * Notify helpers — single call inserts a `notifications` row, fans out
 * `notification_recipients` rows per target user, and sends push notifications.
 *
 * Use these instead of bare `sendPushToUser` / `sendPushToAdmins` so the parent's
 * (or admin's) in-app `/parent/notifications` (resp. `/admin/notifications`) feed
 * also receives the message — push alone is ephemeral.
 */

import { createClient as createServiceClient, SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser, getAdminUserIds } from '@/lib/push/send'

interface NotifyPayload {
  title: string
  body: string
  url?: string
  type: string
}

interface NotifyResult {
  notificationId: string | null
  recipientCount: number
}

function getServiceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function insertNotification(
  service: SupabaseClient,
  payload: NotifyPayload,
  targetType: string,
  targetId: string | null,
  createdBy: string | null,
): Promise<string | null> {
  const { data, error } = await service
    .from('notifications')
    .insert({
      type: payload.type,
      title: payload.title,
      body: payload.body || null,
      url: payload.url || null,
      target_type: targetType,
      target_id: targetId,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error) {
    console.error('notify: failed to insert notification:', error.message)
    return null
  }
  return data?.id ?? null
}

async function fanoutRecipients(
  service: SupabaseClient,
  notificationId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return
  const { error } = await service
    .from('notification_recipients')
    .insert(userIds.map((uid) => ({ notification_id: notificationId, user_id: uid })))
  if (error) {
    console.error('notify: failed to insert recipients:', error.message)
  }
}

async function pushAll(userIds: string[], payload: NotifyPayload): Promise<void> {
  await Promise.allSettled(
    userIds.map((uid) =>
      sendPushToUser(uid, { title: payload.title, body: payload.body, url: payload.url }).catch(() => undefined),
    ),
  )
}

/**
 * Notify all parent users for a family. Creates one in-app notification + N
 * recipient rows + N pushes.
 */
export async function notifyFamily(
  familyId: string,
  payload: NotifyPayload,
  createdBy: string | null = null,
): Promise<NotifyResult> {
  const service = getServiceClient()

  const { data: roles } = await service
    .from('user_roles')
    .select('user_id')
    .eq('family_id', familyId)
    .eq('role', 'parent')

  const userIds = [...new Set((roles ?? []).map((r) => r.user_id as string))]

  const notificationId = await insertNotification(service, payload, 'family', familyId, createdBy)
  if (notificationId) {
    await fanoutRecipients(service, notificationId, userIds)
  }
  await pushAll(userIds, payload)

  return { notificationId, recipientCount: userIds.length }
}

/**
 * Notify all admin users. Creates in-app notification + recipient rows + pushes.
 */
export async function notifyAdmins(
  payload: NotifyPayload,
  createdBy: string | null = null,
): Promise<NotifyResult> {
  const service = getServiceClient()
  const adminIds = await getAdminUserIds()

  const notificationId = await insertNotification(service, payload, 'all', null, createdBy)
  if (notificationId) {
    await fanoutRecipients(service, notificationId, adminIds)
  }
  await pushAll(adminIds, payload)

  return { notificationId, recipientCount: adminIds.length }
}
