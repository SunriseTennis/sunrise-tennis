import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Plan 23 — token_hash confirm route. Sidesteps the PKCE
// verifier-cookie mismatch and the Microsoft-mailbox link-prefetch
// failures that left Outlook/Hotmail signups stuck unconfirmed
// (see Apps/Plans/23-self-signup-confirm-failure.md).
//
// The Supabase email templates point here with:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<next>
// We call verifyOtp({ token_hash, type }) which sets email_confirmed_at
// AND returns a session in one round-trip — no PKCE, no second redirect.
//
// Existing /auth/callback stays as-is for emails sent before the
// template patch (PKCE `code` flow) and for the email_change
// token_hash flow that was already wired there.

const ALLOWED_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
])

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const typeRaw = searchParams.get('type')
  const rawNext = searchParams.get('next')
  // Type-aware default destination — recovery emails should land on
  // the password reset form, everything else heads to /dashboard.
  const defaultNext = typeRaw === 'recovery' ? '/auth/update-password' : '/dashboard'
  // Open-redirect defense — same shape as /auth/callback and (auth)/actions.ts.
  const next = (rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//'))
    ? rawNext
    : defaultNext

  if (!tokenHash || !typeRaw || !ALLOWED_TYPES.has(typeRaw as EmailOtpType)) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('That confirmation link is invalid. Please request a new one.')}`,
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: typeRaw as EmailOtpType,
  })

  if (error) {
    console.error('[auth/confirm] verifyOtp failed:', error.message, 'type=', typeRaw)
    const msg = error.message.toLowerCase()
    const friendly = msg.includes('expired')
      ? 'Your confirmation link has expired. Please request a new one.'
      : msg.includes('used') || msg.includes('not found')
        ? 'That link has already been used. If you set a password, try signing in.'
        : 'Could not confirm your email. Please request a new confirmation link.'
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(friendly)}`)
  }

  // Plan 15 Phase F — same MFA gate as /auth/callback. Magic-link login
  // arrives here too once templates are swapped, so AAL2-required users
  // get bounced to the challenge before reaching their destination.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
    const mfaUrl = next === '/dashboard'
      ? '/login/mfa-challenge'
      : `/login/mfa-challenge?next=${encodeURIComponent(next)}`
    return NextResponse.redirect(`${origin}${mfaUrl}`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
