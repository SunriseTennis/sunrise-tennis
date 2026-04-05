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

  // No role assigned and no valid invite — show pending state
  return (
    <div className="gradient-sunrise flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card/95 p-8 text-center shadow-elevated backdrop-blur">
        <h1 className="text-xl font-semibold text-foreground">Welcome to Sunrise Tennis</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your account is being set up. An admin will assign your access shortly.
        </p>
        <p className="mt-6 text-xs text-muted-foreground/60">
          If you received an invite link, please use that link to sign up.
        </p>
      </div>
    </div>
  )
}
