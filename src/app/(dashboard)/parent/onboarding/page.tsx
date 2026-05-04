import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { OnboardingWizard } from './onboarding-wizard'
import { SelfSignupWizard } from './self-signup-wizard'
import { SELF_SIGNUP_TOTAL_STEPS } from './constants'

export default async function ParentOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>
}) {
  const { step: stepParam, error } = await searchParams
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) redirect('/login')
  const familyId = userRole.family_id

  const [{ data: family }, { data: players }] = await Promise.all([
    supabase
      .from('families')
      .select('primary_contact, completed_onboarding, signup_source, address, terms_acknowledged_at')
      .eq('id', familyId)
      .single(),
    supabase
      .from('players')
      .select('id, first_name, last_name, dob, gender, ball_color, level, media_consent_coaching, media_consent_family, media_consent_social')
      .eq('family_id', familyId)
      .order('first_name'),
  ])

  if (family?.completed_onboarding) {
    redirect('/parent')
  }

  const primaryContact = (family?.primary_contact ?? {}) as {
    name?: string
    phone?: string
    email?: string
  }

  const signupSource = (family?.signup_source ?? 'admin_invite') as
    | 'admin_invite'
    | 'self_signup'
    | 'legacy_import'

  const playerList = (players ?? []).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    dob: p.dob ?? null,
    gender: (p.gender ?? null) as string | null,
    level: (p.ball_color ?? p.level ?? null) as string | null,
    media_consent_coaching: !!p.media_consent_coaching,
    media_consent_family: !!p.media_consent_family,
    media_consent_social: !!p.media_consent_social,
  }))

  if (signupSource === 'self_signup') {
    const requestedStep = parseInt(stepParam ?? '1', 10) || 1
    let currentStep = Math.max(1, Math.min(SELF_SIGNUP_TOTAL_STEPS, requestedStep))

    // Soft step gates: don't let parents skip ahead past required steps.
    // - Step 3 (players summary) requires at least one player.
    // - Step 5/6 require terms ack.
    if (currentStep >= 3 && playerList.length === 0) currentStep = 2
    const termsAck = family?.terms_acknowledged_at ?? null
    if (currentStep >= 5 && !termsAck) currentStep = 4

    return (
      <SelfSignupWizard
        initialStep={currentStep}
        error={error ?? null}
        userEmail={user.email ?? ''}
        primaryContact={primaryContact}
        address={family?.address ?? null}
        players={playerList}
        termsAcknowledgedAt={termsAck}
      />
    )
  }

  // Admin-invite + legacy_import paths use the original 3-step wizard.
  const currentStep = Math.max(1, Math.min(3, parseInt(stepParam ?? '1', 10) || 1))

  return (
    <OnboardingWizard
      initialStep={currentStep}
      error={error ?? null}
      userEmail={user.email ?? ''}
      primaryContact={primaryContact}
      players={playerList}
      signupSource={signupSource}
    />
  )
}
