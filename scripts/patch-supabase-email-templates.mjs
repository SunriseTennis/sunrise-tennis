#!/usr/bin/env node
/**
 * Plan 23 — Patch Supabase Auth email templates from PKCE
 * `{{ .ConfirmationURL }}` flow to token_hash flow targeting our
 * new /auth/confirm route. Avoids the Outlook/Hotmail Safe-Links
 * pre-fetch and cross-device PKCE-verifier failures that left
 * Tara stuck for 24h.
 *
 * Templates patched:
 *  - mailer_templates_confirmation_content (signup confirm)
 *  - mailer_templates_magic_link_content (magic-link login)
 *  - mailer_templates_recovery_content (password reset)
 *
 * Templates left untouched:
 *  - mailer_templates_email_change_content — already wired through
 *    /auth/callback's tokenHash branch and works correctly.
 *  - mailer_templates_invite_content — dormant in our flow (we
 *    use Resend REST directly via sendInvitationEmail; Supabase
 *    Auth's invite path is not called).
 *
 * SMTP fields are NOT touched. The whole-block PATCH gotcha that
 * bit on 03-May-2026 (memory feedback_supabase-mgmt-api-secret-leak.md)
 * applies to smtp_*. Mailer template fields seem to be independent
 * but we GET-then-PATCH-only-template-fields to be safe.
 *
 * Cloudflare WAF on the Management API blocks the default urllib /
 * curl User-Agents — Node's fetch UA passes. If you see HTTP 1010,
 * set USER_AGENT below explicitly.
 *
 * Usage:
 *   op run --env-file=.env.op -- node scripts/patch-supabase-email-templates.mjs --dry-run
 *   op run --env-file=.env.op -- node scripts/patch-supabase-email-templates.mjs --apply
 *   op run --env-file=.env.op -- node scripts/patch-supabase-email-templates.mjs --revert  (restore PKCE templates)
 *
 * Required env: SUPABASE_ACCESS_TOKEN (Management API), NEXT_PUBLIC_SUPABASE_URL.
 */

const APPLY = process.argv.includes('--apply')
const REVERT = process.argv.includes('--revert')
const USER_AGENT = 'sunrise-tennis-template-patch/1.0'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN missing. Run with `op run --env-file=.env.op --`.')
  process.exit(1)
}

// Derive project ref from the Supabase URL (https://<ref>.supabase.co).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!supabaseUrl) {
  console.error('NEXT_PUBLIC_SUPABASE_URL missing.')
  process.exit(1)
}
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const baseUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`

// ── Template bodies (NEW — token_hash flow) ────────────────────────────────

const sharedHeader = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#FFF6ED;font-family:-apple-system,BlinkMacSystemFont,'Plus Jakarta Sans',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6ED;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(232,116,80,0.08);">
      <tr><td style="background:linear-gradient(135deg,#2B5EA7,#6480A4,#E87450,#F7CD5D);padding:32px 24px;text-align:center;">
        <p style="margin:0;color:#fff;font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">Sunrise Tennis</p>`

const sharedFooter = `      </td></tr>
      <tr><td style="background:#FFEAD8;padding:18px 24px;text-align:center;font-size:12px;color:#7a6a5e;line-height:1.65;">
        <a href="https://sunrisetennis.com.au" style="color:#7a6a5e;text-decoration:none;">sunrisetennis.com.au</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`

const button = (label, href) => `<div style="margin:24px 0 8px 0;text-align:center;">
  <a href="${href}" style="display:inline-block;background:#E87450;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">${label}</a>
</div>`

const NEW_TEMPLATES = {
  // signup confirm — type=email per Supabase token_hash docs
  mailer_subjects_confirmation: 'Confirm your Sunrise Tennis email',
  mailer_templates_confirmation_content: `${sharedHeader}
        <h1 style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700;">Confirm your email</h1>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3a3a;">Welcome to Sunrise Tennis. Click the button below to confirm your email and finish setting up your account.</p>
        ${button('Confirm email', '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email')}
        <p style="margin:16px 0 0 0;font-size:13px;line-height:1.55;color:#7a6a5e;">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all;color:#3a3a3a;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email</span></p>
        <p style="margin:16px 0 0 0;font-size:13px;line-height:1.55;color:#7a6a5e;">If you didn't sign up, you can ignore this email.</p>
${sharedFooter}`,

  // magic link login
  mailer_subjects_magic_link: 'Your Sunrise Tennis sign-in link',
  mailer_templates_magic_link_content: `${sharedHeader}
        <h1 style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700;">Sign in to Sunrise Tennis</h1>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3a3a;">Click below to sign in. The link is valid for one hour.</p>
        ${button('Sign in', '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email')}
        <p style="margin:16px 0 0 0;font-size:13px;line-height:1.55;color:#7a6a5e;">If you didn't request this, you can ignore this email.</p>
${sharedFooter}`,

  // password recovery
  mailer_subjects_recovery: 'Reset your Sunrise Tennis password',
  mailer_templates_recovery_content: `${sharedHeader}
        <h1 style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700;">Reset your password</h1>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3a3a;">Click below to choose a new password. The link is valid for one hour.</p>
        ${button('Reset password', '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery')}
        <p style="margin:16px 0 0 0;font-size:13px;line-height:1.55;color:#7a6a5e;">If you didn't request this, your account is safe — you can ignore this email.</p>
${sharedFooter}`,
}

// ── Old (PKCE) templates — for --revert path ───────────────────────────────
//
// These mirror the bodies that Plan 15 Phase A patched in. Only used for
// emergency revert if the new flow misbehaves. If you change them in the
// dashboard later, copy the latest values back here.

const OLD_TEMPLATES = {
  mailer_subjects_confirmation: 'Confirm your Sunrise Tennis email',
  mailer_templates_confirmation_content: `${sharedHeader}
        <h1 style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700;">Confirm your email</h1>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3a3a;">Welcome to Sunrise Tennis. Click the button below to confirm your email and finish setting up your account.</p>
        ${button('Confirm email', '{{ .ConfirmationURL }}')}
        <p style="margin:16px 0 0 0;font-size:13px;line-height:1.55;color:#7a6a5e;">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all;color:#3a3a3a;">{{ .ConfirmationURL }}</span></p>
${sharedFooter}`,
  mailer_subjects_magic_link: 'Your Sunrise Tennis sign-in link',
  mailer_templates_magic_link_content: `${sharedHeader}
        <h1 style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700;">Sign in to Sunrise Tennis</h1>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3a3a;">Click below to sign in. The link is valid for one hour.</p>
        ${button('Sign in', '{{ .ConfirmationURL }}')}
${sharedFooter}`,
  mailer_subjects_recovery: 'Reset your Sunrise Tennis password',
  mailer_templates_recovery_content: `${sharedHeader}
        <h1 style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:700;">Reset your password</h1>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3a3a;">Click below to choose a new password. The link is valid for one hour.</p>
        ${button('Reset password', '{{ .ConfirmationURL }}')}
${sharedFooter}`,
}

// ── Mask any secrets we accidentally pull back from a GET ──────────────────

const SECRET_FIELDS = new Set([
  'smtp_pass',
  'jwt_secret',
  'hook_send_email_secrets',
  'hook_send_sms_secrets',
  'hook_password_verification_attempt_secrets',
  'hook_mfa_verification_attempt_secrets',
  'hook_custom_access_token_secrets',
])

function maskSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const out = Array.isArray(obj) ? [] : {}
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_FIELDS.has(k) && typeof v === 'string' && v.length > 0) {
      out[k] = `<masked: ${v.length} chars>`
    } else if (typeof v === 'object' && v !== null) {
      out[k] = maskSecrets(v)
    } else {
      out[k] = v
    }
  }
  return out
}

// ── Management API helpers ────────────────────────────────────────────────

async function getCurrentConfig() {
  const res = await fetch(baseUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    console.error('GET /config/auth failed:', res.status, await res.text())
    process.exit(1)
  }
  return res.json()
}

async function patchTemplates(payload) {
  const res = await fetch(baseUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    console.error('PATCH /config/auth failed:', res.status, await res.text())
    process.exit(1)
  }
  return res.json()
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const target = REVERT ? OLD_TEMPLATES : NEW_TEMPLATES
  const label = REVERT ? 'REVERT (PKCE flow)' : 'APPLY (token_hash flow)'

  console.log(`\n  ${APPLY ? label : 'DRY-RUN — ' + label}`)
  console.log('  ' + '─'.repeat(72))

  const cfg = await getCurrentConfig()

  console.log('\n  Current template summary (button URL pattern):')
  for (const key of Object.keys(target)) {
    if (!key.endsWith('_content')) continue
    const current = String(cfg[key] ?? '')
    const newer = target[key]
    const currentUsesConfirmation = current.includes('{{ .ConfirmationURL }}')
    const currentUsesTokenHash = current.includes('{{ .TokenHash }}')
    const newerUsesTokenHash = newer.includes('{{ .TokenHash }}')
    let state
    if (current === newer) state = 'IDENTICAL'
    else if (currentUsesTokenHash && newerUsesTokenHash) state = 'token_hash → token_hash (body changed)'
    else if (currentUsesConfirmation && newerUsesTokenHash) state = 'PKCE → token_hash'
    else if (currentUsesTokenHash && !newerUsesTokenHash) state = 'token_hash → PKCE (revert)'
    else state = `unknown (current ConfURL=${currentUsesConfirmation} TH=${currentUsesTokenHash})`
    console.log(`    ${key.padEnd(48)} ${state}`)
  }

  if (!APPLY) {
    console.log('\n  Dry-run only. Re-run with --apply to PATCH.')
    return
  }

  console.log(`\n  PATCHing ${Object.keys(target).length} fields...`)
  const result = await patchTemplates(target)
  console.log('\n  Response (secrets masked):')
  // Only print the fields we set, not the whole config (which includes SMTP).
  const echoed = {}
  for (const k of Object.keys(target)) {
    echoed[k] = result[k] ? `(set, ${String(result[k]).length} chars)` : '<missing>'
  }
  console.log(JSON.stringify(echoed, null, 2))

  // Sanity: confirm the URLs we expect are present.
  const expectedUrl = REVERT ? '{{ .ConfirmationURL }}' : '{{ .TokenHash }}'
  for (const key of Object.keys(target)) {
    if (!key.endsWith('_content')) continue
    if (!String(result[key] ?? '').includes(expectedUrl)) {
      console.error(`  ⚠ ${key} does NOT contain "${expectedUrl}" — patch may have been rejected silently.`)
    }
  }

  console.log('\n  Done. Verify by signing up a fresh test email and clicking the link.')
  console.log('  If the new flow misbehaves, run with --revert to restore PKCE templates.')
  console.log('  Maxim should hold off rotating SMTP credentials in the same window — they are')
  console.log('  unaffected by this patch but the GET above echoed them through context (masked).')
  console.log()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
