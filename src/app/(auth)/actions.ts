'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient, getSessionUser } from '@/lib/supabase/server'
import {
  validateFormData,
  loginFormSchema,
  signupFormSchema,
  signupViaInviteFormSchema,
  magicLinkFormSchema,
  forgotPasswordFormSchema,
  updatePasswordFormSchema,
} from '@/lib/utils/validation'
import { checkRateLimitAsync } from '@/lib/utils/rate-limit'
import { logAuthEvent } from '@/lib/utils/auth-logger'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

// Constrain `next` redirects to relative paths only — defends against
// open-redirect via crafted URLs (e.g. ?next=https://evil.com).
function safeNext(input: string | null | undefined, fallback = '/dashboard'): string {
  if (!input) return fallback
  return input.startsWith('/') && !input.startsWith('//') ? input : fallback
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const parsed = validateFormData(formData, loginFormSchema)
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(parsed.error)}`)
  }

  // Rate limit: 5 login attempts per minute per email
  if (!await checkRateLimitAsync(`login:${parsed.data.email}`, 5, 60_000)) {
    redirect('/login?error=' + encodeURIComponent('Too many login attempts. Please wait a minute.'))
  }

  const { email, password } = parsed.data
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    await logAuthEvent({ email, eventType: 'login_failed', method: 'password', success: false, metadata: { error: error.message } })
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  await logAuthEvent({ userId: data.user?.id, email, eventType: 'login', method: 'password', success: true })

  // Plan 15 Phase F — MFA challenge gate. If the user has a verified TOTP
  // factor, signInWithPassword leaves them at AAL1 with nextLevel=AAL2.
  // Redirect to the challenge page before they can reach /dashboard.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
    revalidatePath('/', 'layout')
    redirect('/login/mfa-challenge')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function verifyMfaChallenge(formData: FormData) {
  const supabase = await createClient()
  const code = (formData.get('code') as string ?? '').replace(/\D/g, '')
  // Plan 15 Phase E — recovery flow threads `next=/auth/update-password`
  // through MFA so users with TOTP enrolled still land at the password
  // reset form (not /dashboard) after passing the challenge.
  const next = safeNext(formData.get('next') as string | null)

  if (!/^\d{6}$/.test(code)) {
    const params = new URLSearchParams({ error: 'Enter the 6-digit code from your authenticator app.' })
    if (next !== '/dashboard') params.set('next', next)
    redirect('/login/mfa-challenge?' + params.toString())
  }

  // Rate limit per-user: 5 attempts/min.
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!await checkRateLimitAsync(`mfa:${user.id}`, 5, 60_000)) {
    const params = new URLSearchParams({ error: 'Too many attempts. Please wait a minute.' })
    if (next !== '/dashboard') params.set('next', next)
    redirect('/login/mfa-challenge?' + params.toString())
  }

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verified = factors?.totp?.find(f => f.status === 'verified')
  if (!verified) {
    // No TOTP factor — shouldn't happen at this gate, but recover gracefully.
    redirect(next)
  }

  const { data: chal, error: ce } = await supabase.auth.mfa.challenge({ factorId: verified.id })
  if (ce || !chal) {
    const params = new URLSearchParams({ error: 'Could not start challenge. Try again.' })
    if (next !== '/dashboard') params.set('next', next)
    redirect('/login/mfa-challenge?' + params.toString())
  }

  const { error: ve } = await supabase.auth.mfa.verify({
    factorId: verified.id,
    challengeId: chal.id,
    code,
  })
  if (ve) {
    await logAuthEvent({ userId: user.id, email: user.email ?? '', eventType: 'login_failed', method: 'mfa_totp', success: false, metadata: { error: ve.message } })
    const params = new URLSearchParams({ error: 'Invalid code. Try again.' })
    if (next !== '/dashboard') params.set('next', next)
    redirect('/login/mfa-challenge?' + params.toString())
  }

  await logAuthEvent({ userId: user.id, email: user.email ?? '', eventType: 'login', method: 'mfa_totp', success: true })
  revalidatePath('/', 'layout')
  redirect(next)
}

export async function loginWithMagicLink(formData: FormData) {
  const supabase = await createClient()

  const parsed = validateFormData(formData, magicLinkFormSchema)
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(parsed.error)}`)
  }

  const { email } = parsed.data
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  })

  if (error) {
    await logAuthEvent({ email, eventType: 'magic_link_request', method: 'magic_link', success: false, metadata: { error: error.message } })
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  await logAuthEvent({ email, eventType: 'magic_link_request', method: 'magic_link', success: true })
  redirect('/verify?type=magic-link')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const parsed = validateFormData(formData, signupFormSchema)
  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent(parsed.error)}`)
  }

  const {
    email,
    password,
    first_name: firstName,
    last_name: lastName,
    invite_token: inviteToken,
    referral_source: referralSource,
    referral_source_detail: referralSourceDetail,
  } = parsed.data

  // Plan 17 Block B — surname is the family name, full string is the
  // primary_contact display name. Both go into user_metadata.
  const fullName = `${firstName} ${lastName}`.trim()

  // Rate limit: 3 signup attempts per minute per email
  if (!await checkRateLimitAsync(`signup:${email}`, 3, 60_000)) {
    redirect('/signup?error=' + encodeURIComponent('Too many signup attempts. Please wait a minute.'))
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        accepted_terms: true,
        accepted_terms_at: new Date().toISOString(),
        ...(inviteToken ? { invite_token: inviteToken } : {}),
        // Plan 15 Phase D — funnel signal. Read by /dashboard at first
        // confirmed-email visit, then passed into create_self_signup_family.
        // Skipped for invite-token paths (admin already knows the source).
        ...(!inviteToken && referralSource ? { referral_source: referralSource } : {}),
        ...(!inviteToken && referralSourceDetail ? { referral_source_detail: referralSourceDetail } : {}),
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  })

  if (error) {
    await logAuthEvent({ email, eventType: 'signup', method: 'password', success: false, metadata: { error: error.message, invite_token: inviteToken || null } })
    const inviteParam = inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''
    redirect(`/signup?error=${encodeURIComponent(error.message)}${inviteParam}`)
  }

  await logAuthEvent({ userId: data.user?.id, email, eventType: 'signup', method: 'password', success: true, metadata: { invite_token: inviteToken || null, first_name: firstName, last_name: lastName, full_name: fullName } })
  redirect('/verify?type=signup')
}

// ── Plan 20 — invite-only signup, no second confirmation email ──────────
//
// Token-bound: the parent received the invite link in the mailbox at the
// invitation's email, so receiving the link is itself proof of email
// ownership. We pre-confirm the auth user via service-role
// admin.createUser({ email_confirm: true }) so Supabase doesn't fire its
// (now redundant) confirmation email — saving one round-trip + one tab
// switch in the wizard.
//
// Name is intentionally NOT collected here — wizard step 1 takes it.
// (Drops the "first/last typed twice" complaint.)
//
// Self-signup keeps the original `signup` action (where the
// confirmation email is the right safety check on a parent we don't
// yet trust).

export async function signupViaInvite(formData: FormData) {
  const parsed = validateFormData(formData, signupViaInviteFormSchema)
  if (!parsed.success) {
    const inviteToken = (formData.get('invite_token') as string | null) ?? ''
    redirect(`/signup?invite=${encodeURIComponent(inviteToken)}&error=${encodeURIComponent(parsed.error)}`)
  }

  const { invite_token: inviteToken, password } = parsed.data

  // Look up the invitation server-side to get the bound email.
  const supabaseRead = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: peek } = await (supabaseRead as any).rpc('peek_invitation_email', { p_token: inviteToken })
  const peekResult = (peek ?? { valid: false }) as {
    valid: boolean
    reason?: 'missing_token' | 'not_found_or_claimed' | 'expired'
    email?: string
  }
  if (!peekResult.valid || !peekResult.email) {
    const msg = peekResult.reason === 'expired'
      ? 'This invite has expired. Please ask Maxim to send a new one.'
      : 'This invite link is no longer valid. If you already signed up, sign in instead.'
    redirect(`/signup?invite=${encodeURIComponent(inviteToken)}&error=${encodeURIComponent(msg)}`)
  }
  const email = peekResult.email

  // Rate-limit per email (rate-limit by token would be trivially bypassed).
  if (!await checkRateLimitAsync(`signup-invite:${email}`, 3, 60_000)) {
    redirect(`/signup?invite=${encodeURIComponent(inviteToken)}&error=${encodeURIComponent('Too many signup attempts. Please wait a minute.')}`)
  }

  // Pre-confirmed admin.createUser via service role. email_confirm:true
  // marks email_confirmed_at immediately so Supabase Auth does NOT fire
  // a confirmation email. The invite_token in user_metadata is what
  // /dashboard later passes to claim_invitation.
  const service = createServiceClient()
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      invite_token: inviteToken,
      accepted_terms: true,
      accepted_terms_at: new Date().toISOString(),
    },
  })

  if (createErr || !created.user) {
    // Most common: parent has a stale account from a previous aborted
    // attempt. Surface a clear "sign in instead" hint.
    const friendly = (createErr?.message ?? '').toLowerCase().includes('already')
      ? 'An account with this email already exists. Sign in instead.'
      : (createErr?.message ?? 'Could not create account. Please try again.')
    await logAuthEvent({ email, eventType: 'signup', method: 'password', success: false, metadata: { error: createErr?.message ?? 'unknown', invite_token: inviteToken, path: 'invite' } })
    redirect(`/signup?invite=${encodeURIComponent(inviteToken)}&error=${encodeURIComponent(friendly)}`)
  }

  await logAuthEvent({ userId: created.user.id, email, eventType: 'signup', method: 'password', success: true, metadata: { invite_token: inviteToken, path: 'invite' } })

  // Sign them in via the JWT-scoped client so the session cookie is set
  // and they land on /dashboard authenticated. /dashboard then calls
  // claim_invitation(token), creates the user_roles parent row, and
  // redirects to /parent/onboarding.
  const supabase = await createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signInErr) {
    // The user IS created; sign-in just failed. Send them to /login
    // with a hint instead of leaving them in limbo.
    await logAuthEvent({ userId: created.user.id, email, eventType: 'login_failed', method: 'password', success: false, metadata: { error: signInErr.message, path: 'invite-post-signup' } })
    redirect(`/login?error=${encodeURIComponent('Account created — please sign in to continue.')}`)
  }

  await logAuthEvent({ userId: created.user.id, email, eventType: 'login', method: 'password', success: true, metadata: { path: 'invite-post-signup' } })
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// ── Plan 15 Phase E — password reset ──────────────────────────────────────
//
// Three-step flow:
//   1. /forgot-password → requestPasswordReset() sends Supabase recovery email
//      (now wired through Resend SMTP via Supabase Auth config — Phase A).
//   2. User clicks the email link → /auth/callback exchanges the PKCE code,
//      sets a recovery session, then redirects to /auth/update-password
//      (passed via `?next=` and threaded through any MFA challenge).
//   3. /auth/update-password → updatePassword() sets the new password,
//      signs the user out, and redirects them back to /login?reset=success
//      so they re-authenticate with the new credentials.

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient()

  const parsed = validateFormData(formData, forgotPasswordFormSchema)
  if (!parsed.success) {
    redirect(`/forgot-password?error=${encodeURIComponent(parsed.error)}`)
  }

  const { email } = parsed.data

  // Rate limit: 3 reset requests per hour per email.
  if (!await checkRateLimitAsync(`pw-reset:${email}`, 3, 60 * 60_000)) {
    redirect('/forgot-password?error=' + encodeURIComponent('Too many reset attempts. Please wait an hour.'))
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/auth/callback?next=/auth/update-password`,
  })

  // We deliberately swallow the error response from Supabase — surfacing
  // "user not found" leaks account-existence. Show the same confirmation
  // page either way. Real failures are logged for admin investigation.
  if (error) {
    console.error('[auth] resetPasswordForEmail:', error.message)
    await logAuthEvent({ email, eventType: 'password_reset_request', method: 'password_reset', success: false, metadata: { error: error.message } })
  } else {
    await logAuthEvent({ email, eventType: 'password_reset_request', method: 'password_reset', success: true })
  }

  redirect('/forgot-password?sent=1')
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const user = await getSessionUser()

  // Recovery session is required — reached via the /auth/callback PKCE
  // exchange after the email link click. Without a session there's nothing
  // to update.
  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Your password reset link has expired. Please request a new one.'))
  }

  const parsed = validateFormData(formData, updatePasswordFormSchema)
  if (!parsed.success) {
    redirect(`/auth/update-password?error=${encodeURIComponent(parsed.error)}`)
  }

  // Rate limit per-user: 5 updates per 10 min (avoids brute-loops).
  if (!await checkRateLimitAsync(`pw-update:${user.id}`, 5, 10 * 60_000)) {
    redirect('/auth/update-password?error=' + encodeURIComponent('Too many attempts. Please wait a few minutes.'))
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    await logAuthEvent({ userId: user.id, email: user.email ?? '', eventType: 'password_reset_complete', method: 'password_reset', success: false, metadata: { error: error.message } })
    redirect(`/auth/update-password?error=${encodeURIComponent(error.message)}`)
  }

  await logAuthEvent({ userId: user.id, email: user.email ?? '', eventType: 'password_reset_complete', method: 'password_reset', success: true })

  // Force re-login with the new password — security best practice + clears
  // any other active sessions.
  await supabase.auth.signOut()
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.delete('x-user-roles')

  revalidatePath('/', 'layout')
  redirect('/login?reset=success')
}

export async function signout() {
  const user = await getSessionUser()
  const supabase = await createClient()
  if (user) {
    await logAuthEvent({ userId: user.id, email: user.email ?? '', eventType: 'signout', success: true })
  }
  await supabase.auth.signOut()

  // Clear cached roles cookie so next login doesn't inherit stale roles
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.delete('x-user-roles')

  revalidatePath('/', 'layout')
  redirect('/login')
}
