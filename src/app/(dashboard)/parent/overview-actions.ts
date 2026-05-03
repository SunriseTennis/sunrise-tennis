'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient, getSessionUser } from '@/lib/supabase/server'
import { performPrivateCancel } from '@/lib/private-cancel'

/**
 * Cancel a private booking from the overview calendar.
 * Returns {error?} (no redirect) so the calling client can show inline state.
 */
export async function cancelPrivateFromOverview(
  bookingId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) return { error: 'Not authenticated' }
  const familyId = userRole.family_id

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`cancel:${user.id}`, 5, 60_000)) {
    return { error: 'Too many requests. Please wait.' }
  }

  const result = await performPrivateCancel({
    supabase,
    service: createServiceClient(),
    bookingId,
    userId: user.id,
    familyId,
  })

  if (result.error) return { error: result.error }

  revalidatePath('/parent')
  revalidatePath('/parent/bookings')
  return {}
}
