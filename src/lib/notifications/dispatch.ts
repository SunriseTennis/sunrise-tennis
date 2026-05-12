/**
 * Plan 11 — Notification dispatcher.
 *
 * Single entry point for all event-driven notifications. Resolves
 * notification_rules rows for the event, fans out per audience, renders
 * templates against the context, and writes in_app + sends push.
 *
 * Old call sites (sendPushToAdmins, sendPushToUser, notifyFamily,
 * notifyAdmins) keep working — but new triggers should use this.
 */

import { createClient as createServiceClient, SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser, getAdminUserIds } from '@/lib/push/send'
import { getEligibleParentUserIds } from '@/lib/utils/private-booking'
import { isQuietHoursActive, nextAdelaideQuietWindowEnd } from '@/lib/utils/time-windows'
import { sendBrandedEmail } from './send-email'
import { queueOutboxRows } from './outbox'
import {
  fetchUserPrefs,
  isOptedIn,
  type NotificationCategory,
  type NotificationChannel,
  type UserPrefs,
} from './preferences'

/**
 * Plan 25 — Audiences subject to Adelaide-local quiet hours (21:00–08:00).
 * Admins are deliberately excluded: real-time business signals always fire
 * immediately. Parents and coaches get push/email deferred until 08:00 the
 * next morning when the dispatcher runs inside quiet hours.
 */
const QUIET_HOURS_AUDIENCES = new Set(['family', 'coach', 'eligible_families'])

export interface DispatchContext {
  /** Family-level resolves to all parent userIds for this family. */
  familyId?: string
  /** Coach-level resolves to the coach's user_id. */
  coachId?: string
  /** Used for 'eligible_families' audience (private slot freed flow). */
  freedSlotCoachId?: string
  /** Optional userId to exclude (e.g. don't notify the actor of their own action). */
  excludeUserId?: string

  // Template placeholders — open vocabulary. Anything missing renders as empty string.
  [key: string]: string | number | undefined | null
}

interface RuleRow {
  id: string
  event_type: string
  audience: string
  enabled: boolean
  channels: string[]
  title_template: string
  body_template: string | null
  url_template: string | null
  /** Plan 22 — opt-out gate keys. Default 'booking' / false at the column level. */
  category: string
  is_mandatory: boolean
}

function getServiceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Replace {key} with context[key]. Missing keys render as empty string. */
function renderTemplate(template: string | null, context: DispatchContext): string {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = context[key]
    return value == null ? '' : String(value)
  })
}

async function resolveAudience(
  service: SupabaseClient,
  audience: string,
  context: DispatchContext,
): Promise<string[]> {
  switch (audience) {
    case 'admins':
      return await getAdminUserIds()
    case 'family': {
      if (!context.familyId) return []
      const { data: roles } = await service
        .from('user_roles')
        .select('user_id')
        .eq('family_id', context.familyId)
        .eq('role', 'parent')
      return [...new Set((roles ?? []).map((r) => r.user_id as string))]
    }
    case 'coach': {
      if (!context.coachId) return []
      const { data: coach } = await service
        .from('coaches')
        .select('user_id')
        .eq('id', context.coachId)
        .single()
      return coach?.user_id ? [coach.user_id as string] : []
    }
    case 'eligible_families': {
      const coachId = context.freedSlotCoachId ?? context.coachId
      if (!coachId) return []
      try {
        return await getEligibleParentUserIds(service, coachId)
      } catch {
        return []
      }
    }
    default:
      return []
  }
}

async function writeInApp(
  service: SupabaseClient,
  ruleId: string,
  audience: string,
  context: DispatchContext,
  rendered: { title: string; body: string; url: string },
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return

  const targetType = audience === 'family' ? 'family' : 'all'
  const targetId = audience === 'family' ? context.familyId ?? null : null

  const { data, error } = await service
    .from('notifications')
    .insert({
      type: 'rule',
      title: rendered.title,
      body: rendered.body || null,
      url: rendered.url || null,
      target_type: targetType,
      target_id: targetId,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('dispatch: notifications insert failed:', error?.message, 'rule:', ruleId)
    return
  }

  const { error: recipientErr } = await service
    .from('notification_recipients')
    .insert(userIds.map((uid) => ({ notification_id: data.id, user_id: uid })))

  if (recipientErr) {
    console.error('dispatch: notification_recipients insert failed:', recipientErr.message)
  }
}

async function sendPush(
  userIds: string[],
  rendered: { title: string; body: string; url: string },
): Promise<void> {
  await Promise.allSettled(
    userIds.map((uid) =>
      sendPushToUser(uid, {
        title: rendered.title,
        body: rendered.body,
        url: rendered.url || undefined,
      }).catch(() => undefined),
    ),
  )
}

/**
 * Plan 17 Block D — fanout the rendered notification over email via the
 * Resend REST API. Each user's auth.users.email is resolved through the
 * service-role client (auth.admin.getUserById). Failures per recipient
 * are swallowed so one bad lookup doesn't drop the whole rule.
 */
async function sendEmailChannel(
  service: SupabaseClient,
  userIds: string[],
  rendered: { title: string; body: string; url: string },
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sunrisetennis.com.au'
  for (const userId of userIds) {
    try {
      const { data: { user } } = await service.auth.admin.getUserById(userId)
      const email = user?.email
      if (!email) continue
      await sendBrandedEmail({
        to: email,
        subject: rendered.title,
        bodyMarkdown: rendered.body || '',
        ctaLabel: rendered.url ? 'Open Sunrise' : undefined,
        ctaUrl: rendered.url ? `${siteUrl}${rendered.url}` : undefined,
      })
    } catch (e) {
      console.error('[dispatch] email lookup/send failed for', userId, e)
    }
  }
}

/**
 * Fire all enabled rules for `eventType`. Renders templates against
 * `context`, fans out to the audience for each rule, and writes
 * in_app rows + sends push per rule's channels.
 *
 * Errors are non-blocking — a missing rule is a no-op (logged), a
 * delivery failure is swallowed per-recipient.
 */
export async function dispatchNotification(
  eventType: string,
  context: DispatchContext,
): Promise<void> {
  const service = getServiceClient()

  const { data: rules, error } = await service
    .from('notification_rules')
    .select('id, event_type, audience, enabled, channels, title_template, body_template, url_template, category, is_mandatory')
    .eq('event_type', eventType)
    .eq('enabled', true)

  if (error) {
    console.error('dispatch: failed to load rules for', eventType, error.message)
    return
  }
  if (!rules || rules.length === 0) {
    // No rule = silent. Admin can add one later.
    return
  }

  for (const rule of rules as RuleRow[]) {
    let userIds = await resolveAudience(service, rule.audience, context)
    if (context.excludeUserId) {
      userIds = userIds.filter((id) => id !== context.excludeUserId)
    }
    if (userIds.length === 0) continue

    const rendered = {
      title: renderTemplate(rule.title_template, context),
      body: renderTemplate(rule.body_template, context),
      url: renderTemplate(rule.url_template, context),
    }

    const channels = Array.isArray(rule.channels) ? rule.channels : []

    // Plan 22 — Per-user opt-out gate. Mandatory rules (security, account)
    // bypass the gate entirely. For non-mandatory rules, fetch every
    // recipient's prefs in one round-trip and filter the userId list per
    // channel. A missing prefs row → category default (which is true for
    // every category except marketing, so existing parents see no change).
    const category = rule.category as NotificationCategory
    const prefsByUser: Map<string, UserPrefs> = rule.is_mandatory
      ? new Map()
      : await fetchUserPrefs(service, userIds)

    const filterByChannel = (channel: NotificationChannel): string[] => {
      if (rule.is_mandatory) return userIds
      return userIds.filter((uid) => isOptedIn(prefsByUser.get(uid), channel, category))
    }

    // Plan 25 — Quiet hours gate. Push/email for parent/coach audiences
    // get deferred to the next 08:00 Adelaide when fired during quiet hours.
    // in_app always writes immediately (passive — only seen on app open, so
    // deferring would create a feed mismatch with DB state). admins are
    // never deferred — real-time business signals.
    const deferThisRule =
      QUIET_HOURS_AUDIENCES.has(rule.audience) && isQuietHoursActive()
    const deliverAfter = deferThisRule ? nextAdelaideQuietWindowEnd() : null

    if (channels.includes('in_app')) {
      const recipients = filterByChannel('in_app')
      if (recipients.length > 0) {
        await writeInApp(service, rule.id, rule.audience, context, rendered, recipients)
      }
    }
    if (channels.includes('push')) {
      const recipients = filterByChannel('push')
      if (recipients.length > 0) {
        if (deferThisRule && deliverAfter) {
          await queueOutboxRows({
            service, userIds: recipients, channel: 'push', rendered,
            rule: { id: rule.id, event_type: rule.event_type, audience: rule.audience, category: rule.category },
            deliverAfter,
          })
        } else {
          await sendPush(recipients, rendered)
        }
      }
    }
    if (channels.includes('email')) {
      const recipients = filterByChannel('email')
      if (recipients.length > 0) {
        if (deferThisRule && deliverAfter) {
          await queueOutboxRows({
            service, userIds: recipients, channel: 'email', rendered,
            rule: { id: rule.id, event_type: rule.event_type, audience: rule.audience, category: rule.category },
            deliverAfter,
          })
        } else {
          await sendEmailChannel(service, recipients, rendered)
        }
      }
    }
  }
}
