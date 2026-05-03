import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  // Prevent open redirect — only allow relative paths
  const next = (rawNext.startsWith('/') && !rawNext.startsWith('//')) ? rawNext : '/dashboard'

  // ── Email change confirmation (token_hash flow) ─────────────────────
  if (tokenHash && type === 'email_change') {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email_change',
    })

    if (error) {
      console.error('Email change verification failed:', error.message)
      return NextResponse.redirect(
        `${origin}/dashboard?error=${encodeURIComponent('Email verification failed. The link may have expired.')}`,
      )
    }

    // Check if this was the final confirmation (email is now updated)
    // or intermediate (still waiting for second confirmation)
    const { data: { user } } = await supabase.auth.getUser()
    const stillPending = user?.user_metadata?.new_email
      && user.user_metadata.new_email !== user.email

    if (stillPending) {
      return NextResponse.redirect(
        `${origin}/dashboard?success=${encodeURIComponent('First confirmation received. Please also confirm from your other email address.')}`,
      )
    }

    return NextResponse.redirect(
      `${origin}/dashboard?success=${encodeURIComponent('Your login email has been updated successfully.')}`,
    )
  }

  // ── PKCE code exchange (login, signup, magic link, password reset) ──
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Plan 15 Phase F — MFA challenge gate. Magic-link login also lands
      // here, so we apply the same AAL2 check used in the password login
      // server action. Users with a verified TOTP factor get redirected
      // to /login/mfa-challenge before reaching their destination.
      // Plan 15 Phase E — pass `next` through so password-reset flow with
      // MFA enrolled still lands at /auth/update-password (not /dashboard).
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
        const mfaUrl = next === '/dashboard'
          ? '/login/mfa-challenge'
          : `/login/mfa-challenge?next=${encodeURIComponent(next)}`
        return NextResponse.redirect(`${origin}${mfaUrl}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth code exchange failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Could not verify your email. Please try again.')}`)
}
