/**
 * Plan 25 — notification_outbox helper.
 *
 * Queues push/email sends for later flushing by the
 * /api/cron/dispatch-queued-notifications cron when notifications fire
 * during Adelaide-local quiet hours (21:00–08:00) for parent/coach
 * audiences.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type OutboxChannel = 'push' | 'email'

export interface QueueOutboxRowsArgs {
  service: SupabaseClient
  userIds: string[]
  channel: OutboxChannel
  rendered: { title: string; body: string; url: string }
  rule: {
    id: string
    event_type: string
    audience: string
    category: string
  }
  deliverAfter: Date
}

/**
 * Insert one `notification_outbox` row per recipient. Caller is responsible
 * for opt-out filtering BEFORE calling this — we trust the supplied userIds
 * are already gated.
 */
export async function queueOutboxRows(args: QueueOutboxRowsArgs): Promise<void> {
  const { service, userIds, channel, rendered, rule, deliverAfter } = args
  if (userIds.length === 0) return

  const rows = userIds.map(userId => ({
    user_id: userId,
    channel,
    title: rendered.title,
    body: rendered.body || '',
    url: rendered.url || null,
    rule_id: rule.id,
    event_type: rule.event_type,
    category: rule.category,
    audience: rule.audience,
    deliver_after: deliverAfter.toISOString(),
    status: 'queued' as const,
  }))

  const { error } = await service.from('notification_outbox').insert(rows)
  if (error) {
    console.error(
      '[outbox] insert failed:',
      error.message,
      'channel:',
      channel,
      'event_type:',
      rule.event_type,
      'recipients:',
      userIds.length,
    )
  }
}
