import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = await getSessionUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user already has a role (may have multiple)
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const roles = userRoles?.map(r => r.role) ?? []

  if (roles.length > 0) {
    // Redirect to highest-priority role
    const primaryRole = roles.includes('admin') ? 'admin' : roles[0]
    redirect(`/${primaryRole}`)
  }

  // No role yet — check if user signed up with an invite token
  const inviteToken = user.user_metadata?.invite_token as string | undefined

  if (inviteToken) {
    // Use SECURITY DEFINER RPC to claim the invitation
    // (RLS blocks direct user_roles INSERT for users with no role)
    const { data: result } = await supabase.rpc('claim_invitation', {
      p_token: inviteToken,
    })

    const claimResult = result as { success?: boolean } | null
    if (claimResult?.success) {
      // Clear the invite token from user metadata
      await supabase.auth.updateUser({
        data: { invite_token: null },
      })

      redirect('/parent/onboarding')
    }
  }

  // No role and no invite — this is a self-signup. Create their family in
  // pending_review state via the SECURITY DEFINER RPC, then send them to
  // the onboarding wizard. The wizard branches on signup_source for the
  // 6-step self-signup intake (vs the 3-step admin-invite flow).
  const fullName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'New family'
  const referralSource = user.user_metadata?.referral_source as string | undefined
  const referralSourceDetail = user.user_metadata?.referral_source_detail as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcResult, error: rpcError } = await (supabase as any).rpc('create_self_signup_family', {
    p_family_name: fullName,
    p_primary_contact: { name: fullName, email: user.email },
    p_referral_source: referralSource ?? null,
    p_referral_source_detail: referralSourceDetail ?? null,
  })

  if (rpcError || !(rpcResult as { success?: boolean } | null)?.success) {
    // Fall through to the limbo card if RPC failed (shouldn't happen).
    return (
      <div className="gradient-sunrise flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-card/95 p-8 text-center shadow-elevated backdrop-blur">
          <h1 className="text-xl font-semibold text-foreground">Welcome to Sunrise Tennis</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We had trouble setting up your account. Please email <a href="mailto:maxim@sunrisetennis.com.au" className="text-primary underline">maxim@sunrisetennis.com.au</a> and we&apos;ll sort it out.
          </p>
        </div>
      </div>
    )
  }

  redirect('/parent/onboarding')
}
