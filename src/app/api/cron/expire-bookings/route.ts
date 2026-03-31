import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push/send'

/**
 * Cron: Expire Pending Bookings
 * Runs every hour. Auto-declines private booking requests that have been
 * pending for more than 24 hours without coach/admin confirmation.
 *
 * Vercel Cron: schedule in vercel.json as "0 * * * *" (every hour)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Find bookings pending for > 24 hours
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 24)

  const { data: expiredBookings } = await supabase
    .from('bookings')
    .select('id, family_id, session_id')
    .eq('booking_type', 'private')
    .eq('approval_status', 'pending')
    .lt('booked_at', cutoff.toISOString())

  if (!expiredBookings?.length) {
    return NextResponse.json({ message: 'No expired bookings', count: 0 })
  }

  let expired = 0

  for (const booking of expiredBookings) {
    // Decline booking
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', approval_status: 'declined', cancellation_type: 'admin' })
      .eq('id', booking.id)

    // Cancel session
    if (booking.session_id) {
      await supabase
        .from('sessions')
        .update({ status: 'cancelled', cancellation_reason: 'Booking request expired (24hr)' })
        .eq('id', booking.session_id)
    }

    // Void any pending charges
    const { data: charges } = await supabase
      .from('charges')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('status', 'pending')

    for (const charge of charges ?? []) {
      await supabase
        .from('charges')
        .update({ status: 'voided' })
        .eq('id', charge.id)
    }

    // Recalculate balance
    await supabase.rpc('recalculate_family_balance', { target_family_id: booking.family_id })

    // Notify parent
    const { data: parentRole } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('family_id', booking.family_id)
      .eq('role', 'parent')
      .limit(1)
      .single()

    if (parentRole) {
      try {
        await sendPushToUser(parentRole.user_id, {
          title: 'Booking Expired',
          body: 'Your private lesson request was not confirmed within 24 hours and has been cancelled',
          url: '/parent/bookings',
        })
      } catch { /* continue */ }
    }

    expired++
  }

  return NextResponse.json({ message: `Expired ${expired} bookings`, count: expired })
}
