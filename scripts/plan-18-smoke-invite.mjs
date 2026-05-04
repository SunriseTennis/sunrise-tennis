// Plan 18 Phase 5 — one-shot smoke test
//
// Creates a fresh "Test Invite — <date>" family with no players,
// generates an invitation row pointing to admin+test@sunrisetennis.com.au,
// and fires the branded invitation email via Resend.
//
// After Maxim walks the flow, archive the test family in /admin/families
// (status='archived' or use the archive script).
//
// Run:
//   op run --env-file=.env.op -- node scripts/plan-18-smoke-invite.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sunrisetennis.com.au').replace(/\/$/, '')

const TARGET_EMAIL = 'admin+test@sunrisetennis.com.au'

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE creds — run via op run --env-file=.env.op')
  process.exit(1)
}
if (!RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY — run via op run --env-file=.env.op')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const today = new Date()
const dateLabel = `${String(today.getDate()).padStart(2, '0')}-${today.toLocaleString('en-AU', { month: 'short' })}-${today.getFullYear()}`
const familyName = `TestInvite ${dateLabel}`

// display_id uses a TPLN18-### prefix so the test family is obvious in
// /admin/families and easy to archive afterwards. Loops if the prefix
// collides with an earlier smoke run.
let displayId = 'TPLN18-001'
for (let i = 1; i <= 99; i++) {
  displayId = `TPLN18-${String(i).padStart(3, '0')}`
  const { data: existing } = await sb.from('families').select('id').eq('display_id', displayId).maybeSingle()
  if (!existing) break
}

console.log(`[plan-18-smoke] creating test family "${displayId} - ${familyName}"...`)
const { data: fam, error: famErr } = await sb
  .from('families')
  .insert({
    display_id: displayId,
    family_name: familyName,
    primary_contact: { name: 'Test Parent', email: TARGET_EMAIL },
    status: 'active',
    signup_source: 'admin_invite',
    approval_status: 'approved',
    completed_onboarding: false,
  })
  .select('id, display_id, family_name')
  .single()

if (famErr) {
  console.error('Family insert failed:', famErr)
  process.exit(1)
}
console.log(`[plan-18-smoke] family created: ${fam.display_id} - ${fam.family_name}`)
console.log(`[plan-18-smoke] family_id: ${fam.id}`)

const token = crypto.randomUUID()
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

const { data: inv, error: invErr } = await sb
  .from('invitations')
  .insert({
    family_id: fam.id,
    email: TARGET_EMAIL,
    token,
    status: 'pending',
    expires_at: expiresAt,
  })
  .select('id, token, expires_at')
  .single()

if (invErr) {
  console.error('Invitation insert failed:', invErr)
  process.exit(1)
}

const inviteUrl = `${SITE_URL}/signup?invite=${encodeURIComponent(inv.token)}`
const expiresFormatted = new Date(inv.expires_at).toLocaleDateString('en-AU', {
  day: 'numeric', month: 'short', year: 'numeric',
})

console.log(`[plan-18-smoke] invitation created: ${inv.id}`)
console.log(`[plan-18-smoke] invite URL: ${inviteUrl}`)
console.log(`[plan-18-smoke] expires: ${expiresFormatted}`)

// Send branded email via Resend REST. Mirrors send-invitation.ts.
const subject = `Welcome to Sunrise Tennis — finish setting up your account`
const preheader = `Your ${familyName} family account is ready. Tap to finish.`
const body = `Maxim has set up a Sunrise Tennis account for the ${familyName} family.

Tap the button below to finish setting up your login. It takes about a minute — confirm your contact details, check your players, enable notifications, and you're done.

This link expires on ${expiresFormatted}. If it stops working, just reply to this email and we'll send a fresh one.

If you weren't expecting this, you can safely ignore the email.`

const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const paragraphs = body.split('\n\n').map(p => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3a3a;white-space:pre-wrap;">${escape(p)}</p>`).join('')

const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#FFF6ED;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#fff;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6ED;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(232,116,80,0.08);">
<tr><td style="background:linear-gradient(135deg,#2B5EA7,#6480A4,#E87450,#F7CD5D);padding:32px 24px;text-align:center;">
<p style="margin:0;color:#fff;font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">Sunrise Tennis</p>
<h1 style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700;">${escape(subject)}</h1>
</td></tr>
<tr><td style="padding:28px 24px;">
${paragraphs}
<div style="margin:24px 0 8px 0;"><a href="${escape(inviteUrl)}" style="display:inline-block;background:#E87450;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">Finish setting up</a></div>
</td></tr>
<tr><td style="background:#FFEAD8;padding:16px 24px;text-align:center;font-size:12px;color:#7a6a5e;">
<a href="https://sunrisetennis.com.au" style="color:#7a6a5e;text-decoration:none;">sunrisetennis.com.au</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`

console.log(`[plan-18-smoke] sending email to ${TARGET_EMAIL}...`)
const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'Sunrise Tennis <noreply@send.sunrisetennis.com.au>',
    to: [TARGET_EMAIL],
    subject,
    html,
  }),
})

if (!res.ok) {
  console.error(`[plan-18-smoke] Resend failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const result = await res.json()
console.log(`[plan-18-smoke] email sent. Resend id: ${result.id}`)
console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(' SMOKE TEST READY')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  Family:   ${fam.display_id} - ${familyName}`)
console.log(`  Email:    ${TARGET_EMAIL}`)
console.log(`  Link:     ${inviteUrl}`)
console.log(`  Expires:  ${expiresFormatted}`)
console.log('')
console.log(`  Next: open ${TARGET_EMAIL} in Gmail and click "Finish setting up".`)
console.log(`  Or paste the link into a fresh incognito tab.`)
console.log(`  Admin URL: ${SITE_URL}/admin/families/${fam.id}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
