'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { validateFormData, loginFormSchema, signupFormSchema, magicLinkFormSchema } from '@/lib/utils/validation'
import { checkRateLimitAsync } from '@/lib/utils/rate-limit'
import { logAuthEvent } from '@/lib/utils/auth-logger'

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

  if (!/^\d{6}$/.test(code)) {
    redirect('/login/mfa-challenge?error=' + encodeURIComponent('Enter the 6-digit code from your authenticator app.'))
  }

  // Rate limit per-user: 5 attempts/min.
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!await checkRateLimitAsync(`mfa:${user.id}`, 5, 60_000)) {
    redirect('/login/mfa-challenge?error=' + encodeURIComponent('Too many attempts. Please wait a minute.'))
  }

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verified = factors?.totp?.find(f => f.status === 'verified')
  if (!verified) {
    // No TOTP factor — shouldn't happen at this gate, but recover gracefully.
    redirect('/dashboard')
  }

  const { data: chal, error: ce } = await supabase.auth.mfa.challenge({ factorId: verified.id })
  if (ce || !chal) {
    redirect('/login/mfa-challenge?error=' + encodeURIComponent('Could not start challenge. Try again.'))
  }

  const { error: ve } = await supabase.auth.mfa.verify({
    factorId: verified.id,
    challengeId: chal.id,
    code,
  })
  if (ve) {
    await logAuthEvent({ userId: user.id, email: user.email ?? '', eventType: 'login_failed', method: 'mfa_totp', success: false, metadata: { error: ve.message } })
    redirect('/login/mfa-challenge?error=' + encodeURIComponent('Invalid code. Try again.'))
  }

  await logAuthEvent({ userId: user.id, email: user.email ?? '', eventType: 'login', method: 'mfa_totp', success: true })
  revalidatePath('/', 'layout')
  redirect('/dashboard')
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
    full_name: fullName,
    invite_token: inviteToken,
    referral_source: referralSource,
    referral_source_detail: referralSourceDetail,
  } = parsed.data

  // Rate limit: 3 signup attempts per minute per email
  if (!await checkRateLimitAsync(`signup:${email}`, 3, 60_000)) {
    redirect('/signup?error=' + encodeURIComponent('Too many signup attempts. Please wait a minute.'))
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
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

  await logAuthEvent({ userId: data.user?.id, email, eventType: 'signup', method: 'password', success: true, metadata: { invite_token: inviteToken || null, full_name: fullName } })
  redirect('/verify?type=signup')
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
