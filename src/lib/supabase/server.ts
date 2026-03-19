import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

/**
 * Get the current user from the session cookie — no network call.
 * Middleware already verifies the JWT on every request, so reading
 * from the cookie here is safe. RLS enforces data-level security.
 */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

/**
 * Require the current user to have admin role.
 * Throws a redirect to /dashboard if not admin.
 * Use as the first line in admin server actions for defense-in-depth
 * (middleware + RLS are the primary barriers, this is the safety net).
 */
export async function requireAdmin(): Promise<User> {
  const { redirect } = await import('next/navigation')
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) return redirect('/login') as never

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .single()

  if (!data) return redirect('/dashboard') as never
  return user
}

/**
 * Require the current user to have coach (or admin) role.
 * Returns the user and their coach_id from user_roles.
 * Throws a redirect if not a coach or admin.
 */
export async function requireCoach(): Promise<{ user: User; coachId: string | null }> {
  const { redirect } = await import('next/navigation')
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) return redirect('/login') as never

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, coach_id')
    .eq('user_id', user.id)

  const coachRole = roles?.find(r => r.role === 'coach')
  const isAdmin = roles?.some(r => r.role === 'admin')

  if (!coachRole && !isAdmin) return redirect('/dashboard') as never
  return { user, coachId: coachRole?.coach_id ?? null }
}

/**
 * Decrypt medical_notes and physical_notes for a player via the
 * authorized RPC function. Returns decrypted text or null.
 * The RPC function enforces auth: admin, parent of family, or assigned coach.
 */
export async function decryptMedicalNotes(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<{ medical_notes: string | null; physical_notes: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('get_player_medical_notes', { p_player_id: playerId })
  const row = Array.isArray(data) ? data[0] : data
  return {
    medical_notes: row?.medical_notes ?? null,
    physical_notes: row?.physical_notes ?? null,
  }
}
