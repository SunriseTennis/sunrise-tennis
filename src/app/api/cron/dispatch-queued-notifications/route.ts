import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push/send'
import { sendBrandedEmail } from '@/lib/notifications/send-email'

/**
 * Plan 25 — Dispatch queued notifications (daily).
 *
 * Flushes push/email rows in `notification_outbox` whose `deliver_after`
 * has passed. Rows land here when `dispatchNotification` runs during
 * Adelaide-local quiet hours (21:00–09:00) for parent/coach audiences.
 *
 * Retention sweep at the end: drops `status='sent'` rows older than 30
 * days to keep the table small. The partial sent-retention index makes
 * the DELETE cheap.
 *
 * Vercel cron: `30 23 * * *` UTC. Fires at 09:00 ACST (winter) or 10:00
 * ACDT (summer) — always ≥ 09:00 Adelaide so no notification can stay
 * queued past the day's window-end. Vercel Hobby caps crons at daily.
 */

const FLUSH_BATCH_LIMIT = 200
const RETENTION_DAYS = 30
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sunrisetennis.com.au'

interface OutboxRow {
  id: string
  user_id: string
  channel: 'push' | 'email'
  title: string
  body: string
  url: string | null
  event_type: string
  category: string
  attempts: number
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Pull due rows. ORDER BY deliver_after keeps an outage-recovery tick from
  // delivering newer rows before older ones.
  const { data: due, error: fetchErr } = await supabase
    .from('notification_outbox')
    .select('id, user_id, channel, title, body, url, event_type, category, attempts')
    .eq('status', 'queued')
    .lte('deliver_after', new Date().toISOString())
    .order('deliver_after', { ascending: true })
    .limit(FLUSH_BATCH_LIMIT)
    .returns<OutboxRow[]>()

  if (fetchErr) {
    console.error('[cron/dispatch-queued] fetch failed:', fetchErr.message)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  }

  let sent = 0
  let failed = 0

  for (const row of due ?? []) {
    let deliveryError: string | null = null
    try {
      if (row.channel === 'push') {
        await sendPushToUser(row.user_id, {
          title: row.title,
          body: row.body || '',
          url: row.url ?? undefined,
        })
      } else if (row.channel === 'email') {
        // Re-resolve the user's email at flush time — handles email-change
        // between queue and flush.
        const { data: userResp } = await supabase.auth.admin.getUserById(row.user_id)
        const email = userResp?.user?.email
        if (!email) {
          deliveryError = 'recipient email not found'
        } else {
          await sendBrandedEmail({
            to: email,
            subject: row.title,
            bodyMarkdown: row.body || '',
            ctaLabel: row.url ? 'Open Sunrise' : undefined,
            ctaUrl: row.url ? `${SITE_URL}${row.url}` : undefined,
          })
        }
      }
    } catch (e) {
      deliveryError = e instanceof Error ? e.message : String(e)
    }

    if (deliveryError) {
      failed += 1
      await supabase
        .from('notification_outbox')
        .update({
          status: 'failed',
          attempts: row.attempts + 1,
          last_error: deliveryError,
        })
        .eq('id', row.id)
    } else {
      sent += 1
      await supabase
        .from('notification_outbox')
        .update({
          status: 'sent',
          attempts: row.attempts + 1,
          sent_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
  }

  // Retention sweep — drop rows already sent more than 30 days ago. Cheap
  // thanks to the partial index `notification_outbox_sent_retention_idx`.
  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error: retentionErr, count: deletedCount } = await supabase
    .from('notification_outbox')
    .delete({ count: 'exact' })
    .eq('status', 'sent')
    .lt('sent_at', retentionCutoff)

  if (retentionErr) {
    console.error('[cron/dispatch-queued] retention sweep failed:', retentionErr.message)
  }

  return NextResponse.json({
    processed: due?.length ?? 0,
    sent,
    failed,
    retentionDeleted: deletedCount ?? 0,
  })
}
