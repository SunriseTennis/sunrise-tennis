'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { voidCharge } from '@/lib/utils/billing'

/**
 * Cancel a private booking from the overview calendar.
 * Simplified version of cancelPrivateBooking that returns { error? } instead of redirecting.
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

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, family_id, session_id, price_cents, status')
    .eq('id', bookingId)
    .single()

  if (!booking || booking.family_id !== familyId) {
    return { error: 'Booking not found' }
  }

  if (booking.status === 'cancelled') {
    return { error: 'Booking already cancelled' }
  }

  // Cancel booking
  await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancellation_type: 'parent_24h' })
    .eq('id', bookingId)

  // Cancel session
  if (booking.session_id) {
    await supabase
      .from('sessions')
      .update({ status: 'cancelled', cancellation_reason: 'Parent cancelled' })
      .eq('id', booking.session_id)
  }

  // Void charge
  const { data: charge } = await supabase
    .from('charges')
    .select('id')
    .eq('booking_id', bookingId)
    .in('status', ['pending', 'confirmed'])
    .single()

  if (charge) {
    await voidCharge(supabase, charge.id, familyId)
  }

  revalidatePath('/parent')
  revalidatePath('/parent/bookings')
  return {}
}
