import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createCharge, voidCharge, formatChargeDescription } from '@/lib/utils/billing'
import { dispatchNotification } from '@/lib/notifications/dispatch'

type Supabase = SupabaseClient<Database>

export interface PerformCancelArgs {
  /** JWT-scoped client used for ownership reads. */
  supabase: Supabase
  /** Service-role client used for the writes (parents have no UPDATE RLS). */
  service: Supabase
  bookingId: string
  userId: string
  familyId: string
}

export interface PerformCancelResult {
  /** 100 = full credit, 50 = partial credit (2nd+ late cancel this term), 0 reserved */
  creditPercent: number
  /** True when the underlying session row was also cancelled (i.e. last booking on it). */
  sessionFreed: boolean
  /** Set when the cancel didn't proceed; caller decides how to surface this. */
  error?: string
}

/**
 * Single source of truth for parent-cancels-a-private. Used by both
 * `cancelPrivateBooking` (bookings page) and `cancelPrivateFromOverview`.
 *
 * Late-fee policy (terms): first cancel per term per family is fully
 * credited. Second-and-onwards late cancels (less than 24h before
 * session) lose 50%. Counter is per-term in `cancellation_tracker`.
 *
 * For paired (shared) privates: cancels only this family's booking +
 * voids only this family's charge. Session row stays scheduled if the
 * partner's booking remains. Partner family gets a heads-up.
 *
 * For standing privates: when the session is freed and notice is >24h,
 * fans out a "private slot available" push to eligible parents.
 */
export async function performPrivateCancel({
  supabase,
  service,
  bookingId,
  userId,
  familyId,
}: PerformCancelArgs): Promise<PerformCancelResult> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, family_id, session_id, price_cents, status, shared_with_booking_id, is_standing')
    .eq('id', bookingId)
    .single()

  if (!booking || booking.family_id !== familyId) {
    return { creditPercent: 0, sessionFreed: false, error: 'Booking not found' }
  }
  if (booking.status === 'cancelled') {
    return { creditPercent: 0, sessionFreed: false, error: 'Booking already cancelled' }
  }
  if (!booking.session_id) {
    return { creditPercent: 0, sessionFreed: false, error: 'Booking has no session' }
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('date, start_time, coach_id')
    .eq('id', booking.session_id)
    .single()
  if (!session) {
    return { creditPercent: 0, sessionFreed: false, error: 'Session not found' }
  }

  const sessionDateTime = new Date(`${session.date}T${session.start_time}`)
  const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
  const isLate = hoursUntil < 24

  const { data: termData } = await supabase.rpc('get_current_term')
  const currentTerm = termData?.[0] ?? { term: 1, year: 2026 }

  let cancellationType: string = 'parent_24h'
  let creditPercent = 100

  if (isLate) {
    const { data: tracker } = await service
      .from('cancellation_tracker')
      .select('late_cancellation_count')
      .eq('family_id', familyId)
      .eq('term', currentTerm.term)
      .eq('year', currentTerm.year)
      .single()

    const count = tracker?.late_cancellation_count ?? 0
    creditPercent = count === 0 ? 100 : 50
    cancellationType = 'parent_late'

    await service.rpc('increment_cancellation_counter', {
      target_family_id: familyId,
      target_term: currentTerm.term,
      target_year: currentTerm.year,
      counter_type: 'late_cancellation',
    })
  }

  // Void existing charge; on partial credit, create a partial-fee charge.
  const { data: existingCharge } = await service
    .from('charges')
    .select('id, amount_cents')
    .eq('booking_id', bookingId)
    .in('status', ['pending', 'confirmed'])
    .single()

  if (existingCharge) {
    await voidCharge(service, existingCharge.id, familyId)

    if (creditPercent < 100) {
      const chargeAmount = Math.round(existingCharge.amount_cents * (1 - creditPercent / 100))
      await createCharge(service, {
        familyId,
        type: 'private',
        sourceType: 'cancellation',
        sessionId: booking.session_id,
        bookingId,
        description: formatChargeDescription({
          label: 'Late cancellation fee',
          suffix: `${100 - creditPercent}%`,
          date: session.date,
        }),
        amountCents: chargeAmount,
        status: 'confirmed',
        createdBy: userId,
      })
    }
  }

  await service
    .from('bookings')
    .update({ status: 'cancelled', cancellation_type: cancellationType })
    .eq('id', bookingId)

  // Cancel the session only when no other booking remains on it.
  let sessionFreed = false
  const { count: remaining } = await service
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', booking.session_id)
    .neq('id', bookingId)
    .neq('status', 'cancelled')

  if ((remaining ?? 0) === 0) {
    await service
      .from('sessions')
      .update({ status: 'cancelled', cancellation_reason: 'Parent cancelled' })
      .eq('id', booking.session_id)
    sessionFreed = true
  }

  // Cancel itself: notify admin + assigned coach via parent.private.cancelled.
  try {
    const { data: bookingDetail } = await supabase
      .from('bookings')
      .select('player_id, players:player_id(first_name)')
      .eq('id', bookingId)
      .single()
    const playerName = (bookingDetail?.players as unknown as { first_name: string } | null)?.first_name ?? 'A player'
    await dispatchNotification('parent.private.cancelled', {
      coachId: session.coach_id ?? undefined,
      playerName,
      date: session.date,
      time: formatTime12(session.start_time!),
      excludeUserId: userId,
    })
  } catch { /* non-blocking */ }

  // Standing-slot freed → eligible families.
  if (sessionFreed && booking.is_standing && !isLate && session.coach_id) {
    try {
      await dispatchNotification('parent.standing_slot.freed', {
        freedSlotCoachId: session.coach_id,
        date: session.date,
        time: formatTime12(session.start_time!),
        excludeUserId: userId,
      })
    } catch { /* non-blocking */ }
  }

  // Heads-up to partner family if their booking still stands.
  if (!sessionFreed && booking.shared_with_booking_id) {
    try {
      const { data: partner } = await supabase
        .from('bookings')
        .select('family_id, sessions:session_id(date, start_time, coaches:coach_id(name))')
        .eq('id', booking.shared_with_booking_id)
        .neq('status', 'cancelled')
        .single()
      if (partner?.family_id) {
        const partnerSession = partner.sessions as unknown as { date: string; start_time: string | null; coaches: { name: string } | null } | null
        const coach = partnerSession?.coaches?.name?.split(' ')[0] ?? 'your coach'
        await dispatchNotification('parent.private.partner_cancelled', {
          familyId: partner.family_id,
          coachName: coach,
          date: partnerSession?.date ?? '',
        })
      }
    } catch { /* non-blocking */ }
  }

  return { creditPercent, sessionFreed }
}

function formatTime12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}

/**
 * When admin or coach cancels a private session, mask the coach's slot at
 * that exact date+time with a `coach_availability_exceptions` row so the
 * weekly availability window doesn't auto-restore the slot for parents to
 * re-book. Parent self-cancels (parent_24h / parent_late) intentionally
 * do NOT call this — the slot should restore for the family to rebook.
 *
 * Idempotent: returns silently if a matching exception already exists or
 * the session has missing fields.
 */
export async function maskCoachSlotOnAdminOrCoachCancel(
  service: Supabase,
  sessionId: string,
  reason: string,
): Promise<void> {
  const { data: session } = await service
    .from('sessions')
    .select('id, date, start_time, end_time, coach_id, session_type')
    .eq('id', sessionId)
    .single()

  if (!session?.coach_id || !session.date || !session.start_time || !session.end_time) {
    return
  }

  // Skip group sessions — those use program scheduling, not coach availability.
  if (session.session_type && session.session_type !== 'private') {
    return
  }

  // Bail if an exception already covers this exact slot (idempotency).
  const { data: existing } = await service
    .from('coach_availability_exceptions')
    .select('id')
    .eq('coach_id', session.coach_id)
    .eq('exception_date', session.date)
    .eq('start_time', session.start_time)
    .eq('end_time', session.end_time)
    .limit(1)

  if (existing && existing.length > 0) return

  const { error } = await service
    .from('coach_availability_exceptions')
    .insert({
      coach_id: session.coach_id,
      exception_date: session.date,
      start_time: session.start_time,
      end_time: session.end_time,
      reason,
    })

  if (error) {
    console.error('maskCoachSlotOnAdminOrCoachCancel insert failed:', error.message)
  }
}
