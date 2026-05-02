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
    .select('id, family_id, session_id, price_cents, status, shared_with_booking_id')
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

  // For paired (shared) privates, never cancel the underlying session here —
  // the partner family's booking still owns it. Only cancel the session when
  // this is the last non-cancelled booking on it.
  let cancelledSession = false
  if (booking.session_id) {
    const { count: remaining } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', booking.session_id)
      .neq('id', bookingId)
      .neq('status', 'cancelled')

    if ((remaining ?? 0) === 0) {
      await supabase
        .from('sessions')
        .update({ status: 'cancelled', cancellation_reason: 'Parent cancelled' })
        .eq('id', booking.session_id)
      cancelledSession = true
    }
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

  // Heads-up to partner family if their booking still stands.
  if (!cancelledSession && booking.shared_with_booking_id) {
    try {
      const { notifyFamily } = await import('@/lib/notifications/notify')
      const { data: partner } = await supabase
        .from('bookings')
        .select('family_id, sessions:session_id(date, start_time, coaches:coach_id(name))')
        .eq('id', booking.shared_with_booking_id)
        .neq('status', 'cancelled')
        .single()
      if (partner?.family_id) {
        const session = partner.sessions as unknown as { date: string; start_time: string | null; coaches: { name: string } | null } | null
        const coach = session?.coaches?.name?.split(' ')[0] ?? 'your coach'
        await notifyFamily(partner.family_id, {
          title: 'Shared private — partner cancelled',
          body: `Your shared private with ${coach} on ${session?.date ?? ''} is now solo. Admin will adjust the rate after the session.`,
          url: '/parent/bookings',
          type: 'booking',
        })
      }
    } catch { /* non-blocking */ }
  }

  revalidatePath('/parent')
  revalidatePath('/parent/bookings')
  return {}
}
