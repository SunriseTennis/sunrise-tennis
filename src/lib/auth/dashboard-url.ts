import { createClient, getSessionUser } from '@/lib/supabase/server'

export interface AuthHomeContext {
  /** Where "back to home" should send the current viewer. */
  homeHref: string
  /** Label shown next to the back-arrow. */
  homeLabel: string
}

/**
 * Resolve the right "back to home" target for the current viewer.
 *
 * Logged-out → '/' + 'Back to home'.
 * Logged-in  → the user's primary dashboard + 'Back to dashboard'.
 *
 * Priority: admin > coach > parent (admins are also coaches/parents in
 * Maxim's case; they should always land on /admin).
 */
export async function getAuthHomeContext(): Promise<AuthHomeContext> {
  const user = await getSessionUser()
  if (!user) return { homeHref: '/', homeLabel: 'Back to home' }

  const supabase = await createClient()
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const roleSet = new Set((roles ?? []).map((r) => r.role as string))
  if (roleSet.has('admin')) return { homeHref: '/admin', homeLabel: 'Back to dashboard' }
  if (roleSet.has('coach')) return { homeHref: '/coach', homeLabel: 'Back to dashboard' }
  if (roleSet.has('parent')) return { homeHref: '/parent', homeLabel: 'Back to dashboard' }

  return { homeHref: '/', homeLabel: 'Back to home' }
}
