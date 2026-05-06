/**
 * Plan 22 Phase 1.3 — Per-user notification preferences.
 *
 * Read path used by the dispatcher (src/lib/notifications/dispatch.ts) and by
 * the legacy cron handlers (pre-charge-notifications, session-reminders) to
 * decide whether to send a given (channel, category) notification to a given
 * user.
 *
 * Defaults: every category is ON for every channel except `marketing`, which
 * defaults OFF (explicit-opt-in posture per Spam Act 2003 § 16). Mandatory
 * categories (security, account) bypass the gate entirely and are forced ON.
 *
 * Failure mode: if the prefs table read fails (RLS misread, schema drift,
 * connection blip), we return the category default for that user. This means
 * a database hiccup can NEVER silently drop a notification — the worst case
 * is we send one a parent had opted out of. That's the safer asymmetry: an
 * extra "Booking confirmed" push beats a missed account-state email.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationCategory =
  | 'security'
  | 'account'
  | 'booking'
  | 'schedule'
  | 'reminder'
  | 'availability'
  | 'admin'
  | 'coach'
  | 'marketing'

export type NotificationChannel = 'email' | 'push' | 'in_app'

/**
 * Categories that bypass the per-user opt-out gate. These notifications are
 * directly tied to user-initiated security or account state — withholding
 * them would break account recovery / leave the parent unable to know whether
 * their signup succeeded. Spam Act 2003 § 16(2) explicitly exempts these as
 * "necessary to facilitate a transaction or service".
 */
export const MANDATORY_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  'security',
  'account',
])

/**
 * Defaults applied when a user has no explicit preference for the (channel,
 * category) tuple. Marketing is the only category that defaults OFF — other
 * categories default ON to preserve current behaviour for existing parents.
 */
export const CATEGORY_DEFAULTS: Record<NotificationCategory, boolean> = {
  security: true,
  account: true,
  booking: true,
  schedule: true,
  reminder: true,
  availability: true,
  admin: true,
  coach: true,
  marketing: false,
}

export type UserPrefs = Partial<
  Record<NotificationChannel, Partial<Record<NotificationCategory, boolean>>>
>

/**
 * Fetch prefs for a batch of users in one round-trip. Used by the dispatcher
 * to avoid an N×M query fan-out (N users × M channels). Missing rows are not
 * an error — they map to an empty UserPrefs which then falls back to defaults.
 */
export async function fetchUserPrefs(
  service: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, UserPrefs>> {
  if (userIds.length === 0) return new Map()
  const { data, error } = await service
    .from('user_notification_preferences')
    .select('user_id, prefs')
    .in('user_id', userIds as string[])
  if (error) {
    // Open-fail: empty map → callers fall back to defaults. We never want a
    // DB hiccup to silently drop an account-state email.
    console.error('[preferences] fetchUserPrefs failed:', error.message)
    return new Map()
  }
  return new Map(
    (data ?? []).map((r) => [r.user_id as string, ((r.prefs ?? {}) as UserPrefs)]),
  )
}

/**
 * Pure function — given a user's cached prefs blob, decide whether they
 * should receive a notification on this (channel, category). Mandatory
 * categories are always true. Explicit user prefs win over defaults.
 */
export function isOptedIn(
  prefs: UserPrefs | undefined,
  channel: NotificationChannel,
  category: NotificationCategory,
): boolean {
  if (MANDATORY_CATEGORIES.has(category)) return true
  const explicit = prefs?.[channel]?.[category]
  if (typeof explicit === 'boolean') return explicit
  return CATEGORY_DEFAULTS[category]
}

/**
 * Convenience wrapper for callers that don't have a cached map — fetches
 * a single user's prefs and resolves the boolean. Use sparingly; prefer
 * the cached map path for batch sends.
 */
export async function getUserChannelOptIn(
  service: SupabaseClient,
  userId: string,
  channel: NotificationChannel,
  category: NotificationCategory,
): Promise<boolean> {
  if (MANDATORY_CATEGORIES.has(category)) return true
  const cache = await fetchUserPrefs(service, [userId])
  return isOptedIn(cache.get(userId), channel, category)
}

/**
 * Update one (channel, category) cell in a user's preferences. Refuses to
 * write mandatory-category opt-outs. Used by the parent settings UI and by
 * the unsubscribe-link endpoint (Phase 3).
 *
 * The client passed in determines auth context: a JWT-scoped client only lets
 * the user write their own row (RLS); a service-role client bypasses RLS and
 * is what the unsubscribe endpoint uses (token IS the auth).
 */
export async function setUserChannelOptIn(
  client: SupabaseClient,
  userId: string,
  channel: NotificationChannel,
  category: NotificationCategory,
  value: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (MANDATORY_CATEGORIES.has(category)) {
    return { ok: false, error: 'This category is mandatory and cannot be turned off.' }
  }

  const { data: existing, error: readError } = await client
    .from('user_notification_preferences')
    .select('prefs')
    .eq('user_id', userId)
    .maybeSingle()

  if (readError && readError.code !== 'PGRST116') {
    return { ok: false, error: readError.message }
  }

  const current = ((existing?.prefs ?? {}) as UserPrefs)
  const channelMap = { ...(current[channel] ?? {}) }
  channelMap[category] = value
  const next: UserPrefs = { ...current, [channel]: channelMap }

  const { error: writeError } = await client
    .from('user_notification_preferences')
    .upsert({ user_id: userId, prefs: next }, { onConflict: 'user_id' })

  if (writeError) return { ok: false, error: writeError.message }
  return { ok: true }
}
