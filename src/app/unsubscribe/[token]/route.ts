/**
 * Plan 22 Phase 3 — Unsubscribe endpoint.
 *
 * Single URL serves both flows:
 *   GET  /unsubscribe/<token>  → branded confirmation page (browser flow)
 *   POST /unsubscribe/<token>  → opt-out (RFC 8058 one-click + form-confirm)
 *
 * Auth: the token IS the auth. Verified via HMAC against
 * NOTIFICATION_UNSUBSCRIBE_SECRET. Mandatory categories (security,
 * account) are refused — the dispatcher would never issue such a token,
 * but we double-check.
 *
 * Audit: every successful opt-out writes one `audit_log` row keyed on the
 * user_id from the token, with `source: 'email_link'`. The settings UI
 * uses `source: 'settings_ui'` via a parallel path.
 *
 * Spam Act 2003 (Cth) compliance: we honour immediately on POST. Failure
 * mode: any verify failure renders a "this link can't be used" page —
 * we never echo the user_id or category back to a malformed token.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  verifyUnsubscribeToken,
  type VerifyResult,
} from '@/lib/notifications/unsubscribe-token'
import {
  MANDATORY_CATEGORIES,
  setUserChannelOptIn,
  type NotificationCategory,
} from '@/lib/notifications/preferences'
import { createServiceClient } from '@/lib/supabase/server'

// Match dispatcher's CATEGORY_LABELS; keeping a local copy avoids importing
// from a server-action file. The two are reviewed together when a category
// is added.
const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  security: 'Account security',
  account: 'Account',
  booking: 'Booking',
  schedule: 'Schedule',
  reminder: 'Reminder',
  availability: 'Slot availability',
  admin: 'Admin',
  coach: 'Coach',
  marketing: 'News & promotions',
}

const CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  security: 'Account security messages.',
  account: 'Approval status, account-state changes.',
  booking: 'Enrolment + private booking confirmations.',
  schedule: 'Cancellations, rain-outs, partner changes.',
  reminder: 'Pre-charge heads-up + session reminders.',
  availability: 'Private slot freed up.',
  admin: 'Admin operational alerts.',
  coach: 'Coach-facing operational alerts.',
  marketing: 'Term updates and special offers.',
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sunrisetennis.com.au'

interface Params {
  params: Promise<{ token: string }>
}

// ─── GET: confirmation page ──────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const { token } = await params
  const result = verifyUnsubscribeToken(token)

  if (!result.valid) {
    return htmlResponse(renderInvalidPage(result), { status: 400 })
  }

  if (MANDATORY_CATEGORIES.has(result.category)) {
    return htmlResponse(renderMandatoryPage(result.category), { status: 400 })
  }

  return htmlResponse(renderConfirmPage(token, result.category))
}

// ─── POST: opt-out ───────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const { token } = await params
  const result = verifyUnsubscribeToken(token)

  if (!result.valid) {
    return htmlResponse(renderInvalidPage(result), { status: 400 })
  }

  if (MANDATORY_CATEGORIES.has(result.category)) {
    return htmlResponse(renderMandatoryPage(result.category), { status: 400 })
  }

  // Detect RFC 8058 one-click flow vs browser form-submit. Both end up at
  // the same opt-out write; the difference is the response shape.
  let isOneClick = false
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      isOneClick = form.get('List-Unsubscribe') === 'One-Click'
    }
  } catch {
    // Fall through — treat as browser flow.
  }

  const service = createServiceClient()
  const opt = await setUserChannelOptIn(service, result.userId, 'email', result.category, false)
  if (!opt.ok) {
    console.error('[unsubscribe] write failed:', opt.error)
    return htmlResponse(renderErrorPage(), { status: 500 })
  }

  // Audit log — non-blocking. Source distinguishes email-link from settings-ui.
  try {
    await service.from('audit_log').insert({
      user_id: result.userId,
      action: 'notification_opt_out',
      entity_type: 'user_notification_preferences',
      entity_id: result.userId,
      new_values: {
        channel: 'email',
        category: result.category,
        value: false,
        source: isOneClick ? 'email_link_one_click' : 'email_link',
      },
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    })
  } catch (e) {
    console.error('[unsubscribe] audit_log insert failed:', e)
  }

  if (isOneClick) {
    // RFC 8058: respond 200 with minimal body; mail clients don't render this.
    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return htmlResponse(renderSuccessPage(result.category))
}

// ─── HTML helpers ────────────────────────────────────────────────────────

function htmlResponse(html: string, init?: ResponseInit): Response {
  return new Response(html, {
    ...init,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init?.headers ?? {}),
    },
  })
}

function shell(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)} — Sunrise Tennis</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:0;background:#FFF6ED;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#3a3a3a}
  .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px}
  .card{max-width:520px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(232,116,80,0.08)}
  .hero{background:linear-gradient(135deg,#2B5EA7,#6480A4,#E87450,#F7CD5D);padding:32px 24px;text-align:center;color:#fff}
  .eyebrow{margin:0;font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.85}
  h1{margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700}
  .body{padding:28px 24px}
  p{margin:0 0 16px 0;font-size:15px;line-height:1.55}
  .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
  .btn{display:inline-block;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;border:none;cursor:pointer;font-family:inherit}
  .btn-primary{background:#E87450;color:#fff}
  .btn-secondary{background:#FFEAD8;color:#7a6a5e}
  .footer{background:#FFEAD8;padding:16px 24px;text-align:center;font-size:12px;color:#7a6a5e}
  .footer a{color:#7a6a5e;text-decoration:underline}
  .muted{color:#7a6a5e;font-size:13px}
</style>
</head><body>
<div class="wrap"><div class="card">
  <div class="hero"><p class="eyebrow">Sunrise Tennis</p><h1>${escapeHtml(title)}</h1></div>
  <div class="body">${inner}</div>
  <div class="footer"><a href="${escapeAttr(SITE_URL)}">sunrisetennis.com.au</a></div>
</div></div>
</body></html>`
}

function renderConfirmPage(token: string, category: NotificationCategory): string {
  const label = CATEGORY_LABELS[category]
  const desc = CATEGORY_DESCRIPTIONS[category]
  const inner = `
    <p>You're about to turn off <strong>${escapeHtml(label)}</strong> emails.</p>
    <p class="muted">${escapeHtml(desc)} You'll still receive account messages and security alerts.</p>
    <form method="POST" action="/unsubscribe/${escapeAttr(token)}" class="row">
      <button type="submit" class="btn btn-primary">Confirm unsubscribe</button>
      <a class="btn btn-secondary" href="${escapeAttr(SITE_URL)}/parent">Cancel</a>
    </form>
    <p class="muted" style="margin-top:24px">Want more control? <a href="${escapeAttr(SITE_URL)}/parent/settings#notifications">Manage all notification preferences →</a></p>
  `
  return shell('Confirm unsubscribe', inner)
}

function renderSuccessPage(category: NotificationCategory): string {
  const label = CATEGORY_LABELS[category]
  const inner = `
    <p>✓ Done. You won't receive <strong>${escapeHtml(label)}</strong> emails.</p>
    <p class="muted">You can change this any time in your notification settings.</p>
    <div class="row">
      <a class="btn btn-primary" href="${escapeAttr(SITE_URL)}/parent/settings#notifications">Manage preferences</a>
      <a class="btn btn-secondary" href="${escapeAttr(SITE_URL)}/parent">Back to Sunrise</a>
    </div>
  `
  return shell("You're unsubscribed", inner)
}

function renderInvalidPage(result: VerifyResult): string {
  const reason =
    !result.valid && result.reason === 'expired'
      ? 'This link has expired.'
      : 'This unsubscribe link can no longer be used.'
  const inner = `
    <p>${escapeHtml(reason)}</p>
    <p class="muted">You can manage all your notification preferences from your account settings — sign in with your Sunrise login.</p>
    <div class="row">
      <a class="btn btn-primary" href="${escapeAttr(SITE_URL)}/parent/settings#notifications">Manage preferences</a>
    </div>
  `
  return shell('Link expired', inner)
}

function renderMandatoryPage(category: NotificationCategory): string {
  const label = CATEGORY_LABELS[category]
  const inner = `
    <p><strong>${escapeHtml(label)}</strong> emails are part of your account and can't be turned off.</p>
    <p class="muted">These messages cover password resets, login alerts, and account-state changes — withholding them would leave you unable to recover access.</p>
    <div class="row">
      <a class="btn btn-primary" href="${escapeAttr(SITE_URL)}/parent/settings#notifications">Manage other preferences</a>
    </div>
  `
  return shell('Account email', inner)
}

function renderErrorPage(): string {
  const inner = `
    <p>Something went wrong saving your preference.</p>
    <p class="muted">Please try again from your account settings, or reply to the email and we'll sort it out.</p>
    <div class="row">
      <a class="btn btn-primary" href="${escapeAttr(SITE_URL)}/parent/settings#notifications">Manage preferences</a>
    </div>
  `
  return shell('Something went wrong', inner)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
function escapeAttr(s: string): string {
  return escapeHtml(s)
}
