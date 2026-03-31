'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { validateFormData, requestPrivateFormSchema, cancelPrivateFormSchema } from '@/lib/utils/validation'
import { createCharge, voidCharge } from '@/lib/utils/billing'
import { sendPushToUser } from '@/lib/push/send'
import {
  canPlayerBookCoach,
  isAutoApproved,
  getPrivatePrice,
  getAvailableSlots,
  validateBookingConstraints,
} from '@/lib/utils/private-booking'

async function getParentAuth(): Promise<{ userId: string; familyId: string }> {
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
  return { userId: user.id, familyId: userRole.family_id }
}

// ── Request a Private Booking ──────────────────────────────────────────

export async function requestPrivateBooking(formData: FormData) {
  const { userId, familyId } = await getParentAuth()
  const supabase = await createClient()

  // Rate limit
  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`booking:${userId}`, 5, 60_000)) {
    redirect('/parent/bookings?error=Too+many+requests.+Please+wait.')
  }

  const parsed = validateFormData(formData, requestPrivateFormSchema)
  if (!parsed.success) {
    redirect(`/parent/bookings?error=${encodeURIComponent(parsed.error)}`)
  }

  const { player_id, coach_id, date, start_time, duration_minutes } = parsed.data

  // Verify player belongs to this family
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, family_id')
    .eq('id', player_id)
    .eq('family_id', familyId)
    .single()

  if (!player) {
    redirect('/parent/bookings?error=Invalid+player')
  }

  // Verify coach exists and is active
  const { data: coach } = await supabase
    .from('coaches')
    .select('id, name, is_owner, user_id')
    .eq('id', coach_id)
    .eq('status', 'active')
    .single()

  if (!coach) {
    redirect('/parent/bookings?error=Coach+not+found')
  }

  // Verify coach is in player's allowlist
  const allowed = await canPlayerBookCoach(supabase, player_id, coach_id)
  if (!allowed) {
    redirect('/parent/bookings?error=This+coach+is+not+available+for+this+player')
  }

  // Validate booking constraints
  const constraints = validateBookingConstraints(date, start_time, coach.is_owner ?? false)
  if (!constraints.valid) {
    redirect(`/parent/bookings?error=${encodeURIComponent(constraints.error!)}`)
  }

  // Verify slot is still available (race condition guard)
  const endMinutes = timeToMinutes(start_time) + duration_minutes
  const endTime = minutesToTime(endMinutes)

  const { data: conflicts } = await supabase
    .from('sessions')
    .select('id')
    .eq('coach_id', coach_id)
    .eq('date', date)
    .neq('status', 'cancelled')
    .lt('start_time', endTime)
    .gt('end_time', start_time)

  if (conflicts && conflicts.length > 0) {
    redirect('/parent/bookings?error=This+slot+is+no+longer+available')
  }

  // Calculate price
  const priceCents = await getPrivatePrice(supabase, coach_id, duration_minutes)

  // Check auto-approve
  const autoApprove = await isAutoApproved(supabase, player_id, coach_id)

  // Create session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      session_type: 'private',
      date,
      start_time,
      end_time: endTime,
      coach_id,
      status: 'scheduled',
      duration_minutes,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    redirect(`/parent/bookings?error=${encodeURIComponent('Failed to create session')}`)
  }

  // Create booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      family_id: familyId,
      player_id,
      session_id: session.id,
      booking_type: 'private',
      status: autoApprove ? 'confirmed' : 'pending',
      approval_status: autoApprove ? 'approved' : 'pending',
      auto_approved: autoApprove,
      approved_by: autoApprove ? userId : null,
      approved_at: autoApprove ? new Date().toISOString() : null,
      price_cents: priceCents,
      duration_minutes,
      booked_by: userId,
    })
    .select('id')
    .single()

  if (bookingError || !booking) {
    // Clean up session
    await supabase.from('sessions').delete().eq('id', session.id)
    redirect(`/parent/bookings?error=${encodeURIComponent('Failed to create booking')}`)
  }

  // Create charge
  await createCharge(supabase, {
    familyId,
    playerId: player_id,
    type: 'private',
    sourceType: 'enrollment',
    sessionId: session.id,
    bookingId: booking.id,
    description: `Private lesson with ${coach.name} - ${date}`,
    amountCents: priceCents,
    status: autoApprove ? 'confirmed' : 'pending',
    createdBy: userId,
  })

  // Push notification to coach
  if (coach.user_id) {
    try {
      await sendPushToUser(coach.user_id, {
        title: autoApprove ? 'Private Lesson Booked' : 'New Booking Request',
        body: `${player.first_name} - ${date} at ${formatTime12(start_time)} (${duration_minutes}min)`,
        url: '/coach/privates',
      })
    } catch {
      // Notification failure is not blocking
    }
  }

  // If auto-approved, also notify parent
  if (autoApprove) {
    // Parent already knows since they booked it, but good for confirmation
  }

  revalidatePath('/parent/bookings')
  revalidatePath('/parent')
  redirect('/parent/bookings?success=Booking+' + (autoApprove ? 'confirmed!' : 'request+submitted!'))
}

// ── Cancel a Private Booking ───────────────────────────────────────────

export async function cancelPrivateBooking(formData: FormData) {
  const { userId, familyId } = await getParentAuth()
  const supabase = await createClient()

  const parsed = validateFormData(formData, cancelPrivateFormSchema)
  if (!parsed.success) {
    redirect(`/parent/bookings?error=${encodeURIComponent(parsed.error)}`)
  }

  const { booking_id } = parsed.data

  // Get the booking and verify ownership
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, family_id, session_id, price_cents, status')
    .eq('id', booking_id)
    .single()

  if (!booking || (booking.family_id !== familyId)) {
    redirect('/parent/bookings?error=Booking+not+found')
  }

  if (booking.status === 'cancelled') {
    redirect('/parent/bookings?error=Booking+already+cancelled')
  }

  // Get session details to check timing
  const { data: session } = await supabase
    .from('sessions')
    .select('date, start_time, coach_id')
    .eq('id', booking.session_id!)
    .single()

  if (!session) {
    redirect('/parent/bookings?error=Session+not+found')
  }

  // Determine if this is a late cancellation
  const sessionDateTime = new Date(`${session.date}T${session.start_time}`)
  const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
  const isLate = hoursUntil < 24

  // Get current term for cancellation tracking
  const { data: termData } = await supabase.rpc('get_current_term')
  const currentTerm = termData?.[0] ?? { term: 1, year: 2026 }

  let cancellationType = 'parent_24h'
  let creditPercent = 100 // Full credit by default

  if (isLate) {
    // Get cancellation counter
    const { data: tracker } = await supabase
      .from('cancellation_tracker')
      .select('late_cancellation_count')
      .eq('family_id', familyId)
      .eq('term', currentTerm.term)
      .eq('year', currentTerm.year)
      .single()

    const count = tracker?.late_cancellation_count ?? 0

    if (count === 0) {
      // First late cancel this term: full credit
      creditPercent = 100
    } else {
      // 2nd+ late cancel: 50% credit
      creditPercent = 50
    }

    cancellationType = 'parent_late'

    // Increment counter
    await supabase.rpc('increment_cancellation_counter', {
      target_family_id: familyId,
      target_term: currentTerm.term,
      target_year: currentTerm.year,
      counter_type: 'late_cancellation',
    })
  }

  // Void existing charge
  const { data: existingCharge } = await supabase
    .from('charges')
    .select('id, amount_cents')
    .eq('booking_id', booking_id)
    .in('status', ['pending', 'confirmed'])
    .single()

  if (existingCharge) {
    await voidCharge(supabase, existingCharge.id, familyId)

    // If partial credit (not 100%), create a charge for the non-refunded portion
    if (creditPercent < 100) {
      const chargeAmount = Math.round(existingCharge.amount_cents * (1 - creditPercent / 100))
      await createCharge(supabase, {
        familyId,
        type: 'private',
        sourceType: 'cancellation',
        sessionId: booking.session_id!,
        bookingId: booking_id,
        description: `Late cancellation fee (${100 - creditPercent}%)`,
        amountCents: chargeAmount,
        status: 'confirmed',
        createdBy: userId,
      })
    }
  }

  // Update booking
  await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_type: cancellationType,
    })
    .eq('id', booking_id)

  // Update session
  await supabase
    .from('sessions')
    .update({ status: 'cancelled', cancellation_reason: 'Parent cancelled' })
    .eq('id', booking.session_id!)

  revalidatePath('/parent/bookings')
  revalidatePath('/parent')

  const msg = creditPercent === 100
    ? 'Booking+cancelled.+Full+credit+applied.'
    : `Booking+cancelled.+${creditPercent}%25+credit+applied.`
  redirect(`/parent/bookings?success=${msg}`)
}

// ── Fetch Available Slots (called from client via server action) ───────

export async function fetchAvailableSlots(coachId: string) {
  await getParentAuth()
  const supabase = await createClient()

  const today = new Date()
  const threeWeeks = new Date()
  threeWeeks.setDate(today.getDate() + 21)

  const startDate = today.toISOString().split('T')[0]
  const endDate = threeWeeks.toISOString().split('T')[0]

  return getAvailableSlots(supabase, coachId, startDate, endDate)
}

// ── Helpers ────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTime12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}
