/**
 * Plan 17 Block D — Branded transactional email via Resend REST API.
 * Used by the dispatcher when a notification rule's `channels` array
 * includes `'email'`. Fire-and-forget — failures are logged but never
 * thrown so the in_app + push channels still complete on email outage.
 *
 * Resend SMTP is already wired for Supabase auth flows (Plan 15 Phase A).
 * This is the platform-side counterpart that uses the same domain
 * (`noreply@send.sunrisetennis.com.au`) for in-platform notifications.
 */

export async function sendBrandedEmail({
  to,
  subject,
  preheader,
  bodyMarkdown,
  ctaLabel,
  ctaUrl,
}: {
  to: string
  subject: string
  preheader?: string
  bodyMarkdown: string
  ctaLabel?: string
  ctaUrl?: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY missing — skipping send to', to)
    return
  }

  const html = renderBrandedHtml({ subject, preheader, bodyMarkdown, ctaLabel, ctaUrl })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Sunrise Tennis <noreply@send.sunrisetennis.com.au>',
        to: [to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      console.error('[email] resend failed', res.status, await res.text())
    }
  } catch (e) {
    console.error('[email] fetch threw', e)
  }
}

function renderBrandedHtml({ subject, preheader, bodyMarkdown, ctaLabel, ctaUrl }: {
  subject: string
  preheader?: string
  bodyMarkdown: string
  ctaLabel?: string
  ctaUrl?: string
}): string {
  const paragraphs = bodyMarkdown
    .split('\n\n')
    .map(p => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3a3a;white-space:pre-wrap;">${escapeHtml(p)}</p>`)
    .join('')
  const cta = (ctaLabel && ctaUrl)
    ? `<a href="${escapeAttr(ctaUrl)}" style="display:inline-block;background:#E87450;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(ctaLabel)}</a>`
    : ''
  const ph = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#fff;">${escapeHtml(preheader)}</div>`
    : ''
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#FFF6ED;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;">
${ph}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6ED;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(232,116,80,0.08);">
      <tr><td style="background:linear-gradient(135deg,#2B5EA7,#6480A4,#E87450,#F7CD5D);padding:32px 24px;text-align:center;">
        <p style="margin:0;color:#fff;font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">Sunrise Tennis</p>
        <h1 style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700;">${escapeHtml(subject)}</h1>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        ${paragraphs}
        ${cta ? `<div style="margin:24px 0 8px 0;">${cta}</div>` : ''}
      </td></tr>
      <tr><td style="background:#FFEAD8;padding:16px 24px;text-align:center;font-size:12px;color:#7a6a5e;">
        <a href="https://sunrisetennis.com.au" style="color:#7a6a5e;text-decoration:none;">sunrisetennis.com.au</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
function escapeAttr(s: string): string {
  return escapeHtml(s)
}
