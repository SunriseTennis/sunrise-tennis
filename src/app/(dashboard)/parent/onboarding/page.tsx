import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { OnboardingWizard } from './onboarding-wizard'
import { SelfSignupWizard } from './self-signup-wizard'
import { SELF_SIGNUP_TOTAL_STEPS, ADMIN_INVITE_TOTAL_STEPS } from './constants'
import { getPrimaryClassification } from '@/lib/utils/player-display'

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
      .select('id, first_name, last_name, preferred_name, dob, gender, classifications, school, media_consent_coaching, media_consent_social')
      .eq('family_id', familyId)
      .order('first_name'),
  ])

  if (family?.completed_onboarding) {
    redirect('/parent')
  }

  const primaryContact = (family?.primary_contact ?? {}) as {
    name?: string
    first_name?: string
    last_name?: string
    phone?: string
    email?: string
  }

  const signupSource = (family?.signup_source ?? 'admin_invite') as
    | 'admin_invite'
    | 'self_signup'
    | 'legacy_import'

  // Plan 24 — `level` field surfaces the player's lowest classification
  // for the wizard's "Step 2: Players" recap row. Single-string consumers
  // (admin-invite recap chip) don't need to change shape.
  const playerList = (players ?? []).map((p) => {
    const classes = ((p as { classifications?: string[] | null }).classifications ?? []) as string[]
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      preferred_name: (p as { preferred_name?: string | null }).preferred_name ?? null,
      dob: p.dob ?? null,
      gender: (p.gender ?? null) as string | null,
      level: getPrimaryClassification({ classifications: classes }),
      school: (p as { school?: string | null }).school ?? null,
      media_consent_coaching: !!p.media_consent_coaching,
      media_consent_social: !!p.media_consent_social,
    }
  })

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

  // Admin-invite + legacy_import paths use the 5-step wizard
  // (Plan 18 — A2HS + Push split out from the legacy combined Step 3.
  // Plan 19 — adds Step 3 Terms+Consent shared with self-signup; players
  // can be added inline at Step 2; ≥1 player required to advance.)
  const requestedStep = parseInt(stepParam ?? '1', 10) || 1
  let currentStep = Math.max(
    1,
    Math.min(ADMIN_INVITE_TOTAL_STEPS, requestedStep),
  )
  if (currentStep >= 3 && playerList.length === 0) currentStep = 2
  const termsAck = family?.terms_acknowledged_at ?? null
  if (currentStep >= 4 && !termsAck) currentStep = 3

  return (
    <OnboardingWizard
      initialStep={currentStep}
      error={error ?? null}
      userEmail={user.email ?? ''}
      primaryContact={primaryContact}
      players={playerList}
    />
  )
}
