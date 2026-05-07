import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendBrandedEmail } from '@/lib/notifications/send-email'

/**
 * Plan 23 — Orphan signup audit (daily).
 *
 * Surfaces two stuck-signup shapes and emails admins if either is non-empty:
 *
 *   1. Never-confirmed: auth.users.email_confirmed_at IS NULL after >24h.
 *      The Plan 23 trigger — Tara Kelly (Outlook) sat here 24h before
 *      Maxim was told. Microsoft mailbox SafeLinks pre-fetch + cross-device
 *      PKCE mismatch are the most common causes; the Plan 23 token_hash
 *      route fixes most of these going forward, but the cron is the
 *      safety net for whatever else slips through.
 *
 *   2. Confirmed-no-role: auth.users.email_confirmed_at set, no row in
 *      user_roles, >24h old. The pre-Plan-15-Phase-B failure mode
 *      (Taryn Wilson sat here 8 days). /dashboard now auto-creates a
 *      family for any role-less confirmed user, so this should be empty —
 *      cron stays as defence-in-depth.
 *
 * Skips:
 *   - admin role users (admin@sunrisetennis.com.au etc — they're system, not stuck)
 *   - @sunrise.test seed accounts
 *
 * Vercel cron: "30 23 * * *" (23:30 UTC = ~10am ACDT / 9am ACST).
 */

const SKIP_DOMAINS = new Set(['sunrise.test'])
const DAY_MS = 24 * 60 * 60 * 1000
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sunrisetennis.com.au'

interface OrphanRow {
  email: string
  created_at: string
  daysWaiting: number
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })

  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role')

  const roleByUser = new Map<string, Set<string>>()
  for (const r of roles ?? []) {
    if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, new Set())
    roleByUser.get(r.user_id)!.add(r.role as string)
  }

  const now = Date.now()
  const neverConfirmed: OrphanRow[] = []
  const confirmedNoRole: OrphanRow[] = []

  for (const u of users) {
    const email = u.email ?? ''
    const domain = email.split('@')[1] ?? ''
    if (!email || SKIP_DOMAINS.has(domain.toLowerCase())) continue

    const userRoles = roleByUser.get(u.id) ?? new Set()
    if (userRoles.has('admin')) continue

    const createdAt = new Date(u.created_at).getTime()
    if (now - createdAt < DAY_MS) continue

    const row: OrphanRow = {
      email,
      created_at: u.created_at,
      daysWaiting: Math.floor((now - createdAt) / DAY_MS),
    }

    if (!u.email_confirmed_at) {
      neverConfirmed.push(row)
    } else if (userRoles.size === 0) {
      confirmedNoRole.push(row)
    }
  }

  if (neverConfirmed.length === 0 && confirmedNoRole.length === 0) {
    return NextResponse.json({
      ok: true,
      neverConfirmed: 0,
      confirmedNoRole: 0,
      adminsEmailed: 0,
    })
  }

  // Resolve admin emails so the digest goes to every active admin.
  const adminUserIds = (roles ?? [])
    .filter(r => r.role === 'admin')
    .map(r => r.user_id as string)

  const adminEmails: string[] = []
  for (const id of adminUserIds) {
    const { data } = await supabase.auth.admin.getUserById(id)
    if (data?.user?.email) adminEmails.push(data.user.email)
  }

  if (adminEmails.length === 0) {
    console.error('[orphan-audit] no admin emails resolvable; cannot send digest')
    return NextResponse.json({
      ok: true,
      neverConfirmed: neverConfirmed.length,
      confirmedNoRole: confirmedNoRole.length,
      adminsEmailed: 0,
      warning: 'no admin emails resolvable',
    })
  }

  // Compose body. Markdown-light — `sendBrandedEmail` splits on \n\n.
  const sections: string[] = []
  if (neverConfirmed.length > 0) {
    const lines = neverConfirmed
      .sort((a, b) => b.daysWaiting - a.daysWaiting)
      .map(r => `• ${r.email} — ${r.daysWaiting} day${r.daysWaiting === 1 ? '' : 's'} ago`)
    sections.push(
      `Never-confirmed signups (${neverConfirmed.length}):\n${lines.join('\n')}`,
    )
  }
  if (confirmedNoRole.length > 0) {
    const lines = confirmedNoRole
      .sort((a, b) => b.daysWaiting - a.daysWaiting)
      .map(r => `• ${r.email} — ${r.daysWaiting} day${r.daysWaiting === 1 ? '' : 's'} ago`)
    sections.push(
      `Confirmed but no role (${confirmedNoRole.length}):\n${lines.join('\n')}`,
    )
  }
  sections.push(
    'For never-confirmed: open Supabase → Authentication → Users, find the row, and choose "Send confirmation". Or run scripts/_confirm-tara.mjs shape against their user_id if the email is verified out-of-band.\n\nFor confirmed-no-role: this should be impossible post-Plan-15. If it shows, the /dashboard auto-create-family path failed for them — investigate scripts/backfill-orphan-signups.mjs.',
  )

  const total = neverConfirmed.length + confirmedNoRole.length
  const subject = `Stuck signup${total === 1 ? '' : 's'} need attention (${total})`

  for (const to of adminEmails) {
    await sendBrandedEmail({
      to,
      subject,
      preheader: `Daily signup audit found ${total} user${total === 1 ? '' : 's'} that need follow-up.`,
      bodyMarkdown: sections.join('\n\n'),
      ctaLabel: 'Open admin queue',
      ctaUrl: `${APP_URL}/admin/approvals`,
    })
  }

  return NextResponse.json({
    ok: true,
    neverConfirmed: neverConfirmed.length,
    confirmedNoRole: confirmedNoRole.length,
    adminsEmailed: adminEmails.length,
  })
}
