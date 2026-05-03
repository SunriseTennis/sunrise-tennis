import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { OnboardingWizard } from './onboarding-wizard'

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
      .select('primary_contact, completed_onboarding, signup_source')
      .eq('id', familyId)
      .single(),
    supabase
      .from('players')
      .select('id, first_name, last_name, dob, ball_color, level')
      .eq('family_id', familyId)
      .order('first_name'),
  ])

  // If already completed, skip to /parent
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

  const currentStep = Math.max(1, Math.min(3, parseInt(stepParam ?? '1', 10) || 1))

  const playerList = (players ?? []).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    dob: p.dob ?? null,
    level: (p.ball_color ?? p.level ?? null) as string | null,
  }))

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
