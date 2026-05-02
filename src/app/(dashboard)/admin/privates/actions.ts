'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import {
  validateFormData,
  coachAvailabilityFormSchema,
  coachExceptionFormSchema,
} from '@/lib/utils/validation'

// ── Admin: Coach Availability ──────────────────────────────────────────

export async function adminSetCoachAvailability(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, coachAvailabilityFormSchema)
  if (!parsed.success) {
    redirect(`/admin/privates/availability?error=${encodeURIComponent(parsed.error)}`)
  }

  const { error } = await supabase
    .from('coach_availability')
    .insert({
      coach_id: parsed.data.coach_id,
      day_of_week: parsed.data.day_of_week,
      start_time: parsed.data.start_time,
      end_time: parsed.data.end_time,
    })

  if (error) {
    const msg = error.code === '23505' ? 'This time slot already exists' : 'Failed to add availability'
    redirect(`/admin/privates/availability?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/admin/privates')
  redirect('/admin/privates/availability')
}

export async function adminRemoveAvailability(availabilityId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('coach_availability')
    .delete()
    .eq('id', availabilityId)

  if (error) {
    redirect(`/admin/privates/availability?error=${encodeURIComponent('Failed to remove availability')}`)
  }

  revalidatePath('/admin/privates')
  redirect('/admin/privates/availability')
}

export async function adminAddException(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, coachExceptionFormSchema)
  if (!parsed.success) {
    redirect(`/admin/privates/availability?error=${encodeURIComponent(parsed.error)}`)
  }

  const { error } = await supabase
    .from('coach_availability_exceptions')
    .insert({
      coach_id: parsed.data.coach_id,
      exception_date: parsed.data.exception_date,
      start_time: parsed.data.start_time || null,
      end_time: parsed.data.end_time || null,
      reason: parsed.data.reason || null,
    })

  if (error) {
    const msg = error.code === '23505' ? 'This exception already exists' : 'Failed to add exception'
    redirect(`/admin/privates/availability?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/admin/privates')
  redirect('/admin/privates/availability')
}

export async function adminRemoveException(exceptionId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('coach_availability_exceptions')
    .delete()
    .eq('id', exceptionId)

  if (error) {
    redirect(`/admin/privates/availability?error=${encodeURIComponent('Failed to remove exception')}`)
  }

  revalidatePath('/admin/privates')
  redirect('/admin/privates/availability')
}

// Form-data wrapper accepting a comma-separated list of ids — used by the
// grouped exception list to remove an entire date-range group in one click.
export async function adminRemoveExceptionGroup(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const idsRaw = (formData.get('ids') as string) ?? ''
  const ids = idsRaw.split(',').filter(Boolean)
  if (ids.length === 0) redirect('/admin/privates/availability?error=Missing+ids')

  const { error } = await supabase
    .from('coach_availability_exceptions')
    .delete()
    .in('id', ids)

  if (error) {
    redirect(`/admin/privates/availability?error=${encodeURIComponent('Failed to remove exceptions')}`)
  }

  revalidatePath('/admin/privates')
  redirect('/admin/privates/availability')
}

// ── Admin: Stage-and-Save Availability ─────────────────────────────────

export async function adminApplyCoachAvailabilityChanges(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const coachId = formData.get('coach_id') as string
  if (!coachId) redirect('/admin/privates/availability?error=Coach+is+required')

  const deletesRaw = (formData.get('deletes') as string) ?? ''
  const insertsRaw = (formData.get('inserts') as string) ?? '[]'
  const deleteIds = deletesRaw.split(',').filter(Boolean)
  let inserts: { day: number; start: string; end: string }[] = []
  try {
    inserts = JSON.parse(insertsRaw)
    if (!Array.isArray(inserts)) inserts = []
  } catch {
    inserts = []
  }

  if (deleteIds.length === 0 && inserts.length === 0) {
    redirect(`/admin/privates/availability?coach_id=${coachId}`)
  }

  const { error } = await supabase.rpc('apply_coach_availability_changes', {
    p_coach_id: coachId,
    p_delete_ids: deleteIds,
    p_inserts: inserts,
  })

  if (error) {
    redirect(`/admin/privates/availability?coach_id=${coachId}&error=${encodeURIComponent(error.message ?? 'Failed to save')}`)
  }

  revalidatePath('/admin/privates/availability')
  redirect(`/admin/privates/availability?coach_id=${coachId}`)
}

export async function adminAddExceptionRange(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const coachId = formData.get('coach_id') as string
  if (!coachId) redirect('/admin/privates/availability?error=Coach+is+required')

  const startDate = formData.get('start_date') as string
  const endDate = (formData.get('end_date') as string) || startDate
  const allDay = formData.get('all_day') === 'on'
  const startTime = allDay ? null : (formData.get('start_time') as string) || null
  const endTime = allDay ? null : (formData.get('end_time') as string) || null
  const reason = (formData.get('reason') as string) || null

  if (!startDate) {
    redirect(`/admin/privates/availability?coach_id=${coachId}&error=Start+date+is+required`)
  }

  const { error } = await supabase.rpc('add_coach_exception_range', {
    p_coach_id: coachId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_start_time: startTime ?? undefined,
    p_end_time: endTime ?? undefined,
    p_reason: reason ?? undefined,
  })

  if (error) {
    redirect(`/admin/privates/availability?coach_id=${coachId}&error=${encodeURIComponent(error.message ?? 'Failed to add')}`)
  }

  revalidatePath('/admin/privates/availability')
  redirect(`/admin/privates/availability?coach_id=${coachId}`)
}

// ── Admin: Player Allowed Coaches ──────────────────────────────────────

export async function setPlayerAllowedCoaches(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const playerId = formData.get('player_id') as string
  const coachIds = formData.getAll('coach_ids') as string[]
  const autoApproveIds = formData.getAll('auto_approve') as string[]

  if (!playerId) {
    redirect('/admin/privates?error=Player+is+required')
  }

  // Delete existing allowlist
  await supabase
    .from('player_allowed_coaches')
    .delete()
    .eq('player_id', playerId)

  // Insert new allowlist (if any coaches selected)
  if (coachIds.length > 0) {
    const rows = coachIds.map(coachId => ({
      player_id: playerId,
      coach_id: coachId,
      auto_approve: autoApproveIds.includes(coachId),
    }))

    const { error } = await supabase
      .from('player_allowed_coaches')
      .insert(rows)

    if (error) {
      redirect(`/admin/privates?error=${encodeURIComponent('Failed to update allowed coaches')}`)
    }
  }

  revalidatePath('/admin/families')
  revalidatePath('/admin/privates')
  redirect(`/admin/privates?success=Updated+allowed+coaches`)
}

// ── Admin: Confirm/Decline Private Booking ────────────────────────────

export async function adminConfirmBooking(bookingId: string) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, session_id, family_id, approval_status')
    .eq('id', bookingId)
    .single()

  if (!booking || booking.approval_status !== 'pending') {
    redirect('/admin/privates/bookings?error=Booking+not+found+or+already+processed')
  }

  await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      approval_status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', bookingId)

  await supabase
    .from('charges')
    .update({ status: 'confirmed' })
    .eq('booking_id', bookingId)
    .eq('status', 'pending')

  // Notify parent
  const { data: parentRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('family_id', booking.family_id)
    .eq('role', 'parent')
    .limit(1)
    .single()

  // Notify coach (cross-notification)
  const { data: session } = await supabase
    .from('sessions')
    .select('coach_id, coaches:coach_id(user_id)')
    .eq('id', booking.session_id!)
    .single()

  const { sendPushToUser } = await import('@/lib/push/send')
  try {
    if (parentRole) {
      await sendPushToUser(parentRole.user_id, {
        title: 'Private Lesson Confirmed',
        body: 'Your booking has been confirmed',
        url: '/parent/bookings',
      })
    }
    const coachUserId = (session?.coaches as unknown as { user_id: string } | null)?.user_id
    if (coachUserId) {
      await sendPushToUser(coachUserId, {
        title: 'Booking Confirmed by Admin',
        body: 'A pending private lesson has been confirmed',
        url: '/coach/privates',
      })
    }
  } catch { /* non-blocking */ }

  revalidatePath('/admin/privates/bookings')
  redirect('/admin/privates/bookings?success=Booking+confirmed')
}

export async function adminDeclineBooking(bookingId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, session_id, family_id, approval_status')
    .eq('id', bookingId)
    .single()

  if (!booking || booking.approval_status !== 'pending') {
    redirect('/admin/privates/bookings?error=Booking+not+found+or+already+processed')
  }

  await supabase
    .from('bookings')
    .update({ status: 'cancelled', approval_status: 'declined' })
    .eq('id', bookingId)

  await supabase
    .from('sessions')
    .update({ status: 'cancelled', cancellation_reason: 'Declined by admin' })
    .eq('id', booking.session_id!)

  // Void charge
  const { voidCharge } = await import('@/lib/utils/billing')
  const { data: charge } = await supabase
    .from('charges')
    .select('id')
    .eq('booking_id', bookingId)
    .in('status', ['pending', 'confirmed'])
    .single()

  if (charge) {
    await voidCharge(supabase, charge.id, booking.family_id)
  }

  // Notify parent and coach
  const { data: parentRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('family_id', booking.family_id)
    .eq('role', 'parent')
    .limit(1)
    .single()

  const { data: session } = await supabase
    .from('sessions')
    .select('coach_id, coaches:coach_id(user_id)')
    .eq('id', booking.session_id!)
    .single()

  const { sendPushToUser } = await import('@/lib/push/send')
  try {
    if (parentRole) {
      await sendPushToUser(parentRole.user_id, {
        title: 'Booking Declined',
        body: 'Your private lesson request was not accepted',
        url: '/parent/bookings',
      })
    }
    const coachUserId = (session?.coaches as unknown as { user_id: string } | null)?.user_id
    if (coachUserId) {
      await sendPushToUser(coachUserId, {
        title: 'Booking Declined by Admin',
        body: 'A pending private lesson was declined',
        url: '/coach/privates',
      })
    }
  } catch { /* non-blocking */ }

  revalidatePath('/admin/privates/bookings')
  redirect('/admin/privates/bookings?success=Booking+declined')
}

// ── Admin: Batch Confirm/Decline ─────────────────────────────────────

export async function adminBatchConfirm(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()
  const ids = formData.getAll('booking_ids') as string[]
  if (!ids.length) redirect('/admin/privates/bookings?error=No+bookings+selected')

  let confirmed = 0
  const { sendPushToUser } = await import('@/lib/push/send')

  for (const bookingId of ids) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, session_id, family_id, approval_status')
      .eq('id', bookingId)
      .single()

    if (!booking || booking.approval_status !== 'pending') continue

    await supabase.from('bookings').update({
      status: 'confirmed', approval_status: 'approved',
      approved_by: user.id, approved_at: new Date().toISOString(),
    }).eq('id', bookingId)

    await supabase.from('charges').update({ status: 'confirmed' }).eq('booking_id', bookingId).eq('status', 'pending')

    // Notifications
    try {
      const { data: parentRole } = await supabase.from('user_roles').select('user_id').eq('family_id', booking.family_id).eq('role', 'parent').limit(1).single()
      if (parentRole) await sendPushToUser(parentRole.user_id, { title: 'Private Lesson Confirmed', body: 'Your booking has been confirmed', url: '/parent/bookings' })
      const { data: session } = await supabase.from('sessions').select('coaches:coach_id(user_id)').eq('id', booking.session_id!).single()
      const coachUserId = (session?.coaches as unknown as { user_id: string } | null)?.user_id
      if (coachUserId) await sendPushToUser(coachUserId, { title: 'Booking Confirmed', body: 'A private lesson has been confirmed', url: '/coach/privates' })
    } catch (err) { console.error('Batch confirm notification error:', err) }

    confirmed++
  }

  revalidatePath('/admin/privates/bookings')
  redirect(`/admin/privates/bookings?success=${confirmed}+booking(s)+confirmed`)
}

export async function adminBatchDecline(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()
  const ids = formData.getAll('booking_ids') as string[]
  if (!ids.length) redirect('/admin/privates/bookings?error=No+bookings+selected')

  let declined = 0
  const { voidCharge } = await import('@/lib/utils/billing')
  const { sendPushToUser } = await import('@/lib/push/send')

  for (const bookingId of ids) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, session_id, family_id, approval_status')
      .eq('id', bookingId)
      .single()

    if (!booking || booking.approval_status !== 'pending') continue

    await supabase.from('bookings').update({ status: 'cancelled', approval_status: 'declined' }).eq('id', bookingId)
    await supabase.from('sessions').update({ status: 'cancelled', cancellation_reason: 'Declined by admin' }).eq('id', booking.session_id!)

    const { data: charge } = await supabase.from('charges').select('id').eq('booking_id', bookingId).in('status', ['pending', 'confirmed']).single()
    if (charge) await voidCharge(supabase, charge.id, booking.family_id)

    try {
      const { data: parentRole } = await supabase.from('user_roles').select('user_id').eq('family_id', booking.family_id).eq('role', 'parent').limit(1).single()
      if (parentRole) await sendPushToUser(parentRole.user_id, { title: 'Booking Declined', body: 'Your private lesson request was not accepted', url: '/parent/bookings' })
      const { data: session } = await supabase.from('sessions').select('coaches:coach_id(user_id)').eq('id', booking.session_id!).single()
      const coachUserId = (session?.coaches as unknown as { user_id: string } | null)?.user_id
      if (coachUserId) await sendPushToUser(coachUserId, { title: 'Booking Declined', body: 'A private lesson was declined', url: '/coach/privates' })
    } catch (err) { console.error('Batch decline notification error:', err) }

    declined++
  }

  revalidatePath('/admin/privates/bookings')
  redirect(`/admin/privates/bookings?success=${declined}+booking(s)+declined`)
}

// ── Admin: Coach Payment Recording ─────────────────────────────────────

export async function recordCoachPayment(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const coachId = formData.get('coach_id') as string
  const amountDollars = formData.get('amount_dollars') as string
  const notes = formData.get('notes') as string

  if (!coachId || !amountDollars) {
    redirect('/admin/privates/earnings?error=Coach+and+amount+are+required')
  }

  const amountCents = Math.round(parseFloat(amountDollars) * 100)
  if (isNaN(amountCents) || amountCents <= 0) {
    redirect('/admin/privates/earnings?error=Invalid+amount')
  }

  // Get coach's pay period
  const { data: coach } = await supabase
    .from('coaches')
    .select('pay_period')
    .eq('id', coachId)
    .single()

  const { getPayPeriodKey } = await import('@/lib/utils/private-booking')
  const payPeriodKey = getPayPeriodKey(new Date(), coach?.pay_period ?? 'weekly')

  // Get admin user
  const { getSessionUser } = await import('@/lib/supabase/server')
  const user = await getSessionUser()

  // Create payment record
  const { error: paymentError } = await supabase
    .from('coach_payments')
    .insert({
      coach_id: coachId,
      amount_cents: amountCents,
      pay_period_key: payPeriodKey,
      notes: notes || null,
      paid_by: user?.id ?? null,
    })

  if (paymentError) {
    redirect(`/admin/privates/earnings?error=${encodeURIComponent('Failed to record payment')}`)
  }

  // Mark matching owed earnings as paid (up to the amount paid)
  const { data: owedEarnings } = await supabase
    .from('coach_earnings')
    .select('id, amount_cents')
    .eq('coach_id', coachId)
    .eq('status', 'owed')
    .order('created_at')

  let remaining = amountCents
  for (const earning of owedEarnings ?? []) {
    if (remaining <= 0) break
    await supabase
      .from('coach_earnings')
      .update({ status: 'paid' })
      .eq('id', earning.id)
    remaining -= earning.amount_cents
  }

  revalidatePath('/admin/privates/earnings')
  redirect('/admin/privates/earnings?success=Payment+recorded')
}

// ── Admin: Book Private on Behalf ──────────────────────────────────────

async function createPrivateInstance(args: {
  supabase: Awaited<ReturnType<typeof createClient>>
  familyId: string
  player: { id: string; first_name: string }
  coachId: string
  coachName: string
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  priceCents: number
  adminUserId: string | null
  isStanding: boolean
  parentBookingId: string | null
}): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const { supabase } = args
  const { data: session } = await supabase
    .from('sessions')
    .insert({
      session_type: 'private', date: args.date, start_time: args.startTime, end_time: args.endTime,
      coach_id: args.coachId, status: 'scheduled', duration_minutes: args.durationMinutes,
    })
    .select('id')
    .single()
  if (!session) return { ok: false, error: 'Failed to create session' }

  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      family_id: args.familyId, player_id: args.player.id,
      session_id: session.id, booking_type: 'private',
      status: 'confirmed', approval_status: 'approved', auto_approved: true,
      approved_by: args.adminUserId, approved_at: new Date().toISOString(),
      price_cents: args.priceCents, duration_minutes: args.durationMinutes,
      booked_by: args.adminUserId,
      is_standing: args.isStanding,
      standing_parent_id: args.parentBookingId,
    })
    .select('id')
    .single()
  if (!booking) {
    await supabase.from('sessions').delete().eq('id', session.id)
    return { ok: false, error: 'Failed to create booking' }
  }

  const { createCharge, formatChargeDescription } = await import('@/lib/utils/billing')
  await createCharge(supabase, {
    familyId: args.familyId, playerId: args.player.id,
    type: 'private', sourceType: 'enrollment',
    sessionId: session.id, bookingId: booking.id,
    description: formatChargeDescription({
      playerName: args.player.first_name,
      label: `Private w/ ${args.coachName}`,
      date: args.date,
    }),
    amountCents: args.priceCents, status: 'confirmed', createdBy: args.adminUserId,
  })

  return { ok: true, bookingId: booking.id }
}

export async function adminBookPrivate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const familyId = formData.get('family_id') as string
  const coachId = formData.get('coach_id') as string
  const playerId = formData.get('player_id') as string
  const date = formData.get('date') as string
  const startTime = formData.get('start_time') as string
  const durationMinutes = parseInt(formData.get('duration_minutes') as string)
  const scheduleMode = (formData.get('schedule_mode') as string) || 'one_off'

  if (!familyId || !coachId || !playerId || !date || !startTime || !durationMinutes) {
    redirect('/admin/privates/bookings?error=All+fields+are+required')
  }

  const { data: player } = await supabase
    .from('players')
    .select('id, first_name')
    .eq('id', playerId)
    .eq('family_id', familyId)
    .single()
  if (!player) redirect('/admin/privates/bookings?error=Player+not+found+in+this+family')

  const { data: coach } = await supabase.from('coaches').select('name').eq('id', coachId).single()
  const coachName = coach?.name ?? 'coach'

  const { getPrivatePrice } = await import('@/lib/utils/private-booking')
  const priceCents = await getPrivatePrice(supabase, familyId, coachId, durationMinutes)

  const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])
  const endMinutes = startMinutes + durationMinutes
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

  const { getSessionUser } = await import('@/lib/supabase/server')
  const adminUser = await getSessionUser()
  const adminUserId = adminUser?.id ?? null

  const first = await createPrivateInstance({
    supabase,
    familyId, player: { id: player.id, first_name: player.first_name },
    coachId, coachName, date, startTime, endTime, durationMinutes,
    priceCents, adminUserId,
    isStanding: scheduleMode === 'standing',
    parentBookingId: null,
  })
  if (!first.ok) redirect(`/admin/privates/bookings?error=${encodeURIComponent(first.error)}`)

  let count = 1
  if (scheduleMode === 'standing') {
    const { getStandingDates } = await import('@/lib/utils/private-booking')
    const dayOfWeek = new Date(date + 'T12:00:00').getDay()
    const futureDates = getStandingDates(dayOfWeek, date)

    for (const futureDate of futureDates) {
      const inst = await createPrivateInstance({
        supabase,
        familyId, player: { id: player.id, first_name: player.first_name },
        coachId, coachName, date: futureDate, startTime, endTime, durationMinutes,
        priceCents, adminUserId,
        isStanding: true,
        parentBookingId: first.bookingId,
      })
      if (inst.ok) count++
    }
  }

  revalidatePath('/admin/privates/bookings')
  revalidatePath('/admin/privates')
  const msg = scheduleMode === 'standing'
    ? `${count}+weekly+sessions+booked`
    : 'Private+lesson+booked'
  redirect(`/admin/privates/bookings?success=${msg}`)
}

// ── Admin: Shared Private (2 players, possibly different families) ─────

async function createSharedPrivateInstance(args: {
  supabase: Awaited<ReturnType<typeof createClient>>
  familyId1: string
  player1: { id: string; first_name: string }
  familyId2: string
  player2: { id: string; first_name: string }
  coachId: string
  coachName: string
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  totalPriceCents: number
  halfPrice: number
  adminUserId: string | null
  isStanding: boolean
  parentBookingId: string | null
}): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const { supabase } = args
  const { data: session } = await supabase
    .from('sessions')
    .insert({
      session_type: 'private', date: args.date, start_time: args.startTime, end_time: args.endTime,
      coach_id: args.coachId, status: 'scheduled', duration_minutes: args.durationMinutes,
    })
    .select('id')
    .single()
  if (!session) return { ok: false, error: 'Failed to create session' }

  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      family_id: args.familyId1, player_id: args.player1.id,
      second_player_id: args.player2.id, second_family_id: args.familyId2,
      session_id: session.id, booking_type: 'private',
      status: 'confirmed', approval_status: 'approved', auto_approved: true,
      approved_by: args.adminUserId, approved_at: new Date().toISOString(),
      price_cents: args.totalPriceCents, duration_minutes: args.durationMinutes,
      booked_by: args.adminUserId,
      is_standing: args.isStanding,
      standing_parent_id: args.parentBookingId,
    })
    .select('id')
    .single()
  if (!booking) {
    await supabase.from('sessions').delete().eq('id', session.id)
    return { ok: false, error: 'Failed to create booking' }
  }

  const { createCharge, formatChargeDescription } = await import('@/lib/utils/billing')
  await createCharge(supabase, {
    familyId: args.familyId1, playerId: args.player1.id,
    type: 'private', sourceType: 'enrollment',
    sessionId: session.id, bookingId: booking.id,
    description: formatChargeDescription({
      playerName: args.player1.first_name,
      label: `Shared private w/ ${args.coachName} (+ ${args.player2.first_name})`,
      date: args.date,
    }),
    amountCents: args.halfPrice, status: 'confirmed', createdBy: args.adminUserId,
  })
  await createCharge(supabase, {
    familyId: args.familyId2, playerId: args.player2.id,
    type: 'private', sourceType: 'enrollment',
    sessionId: session.id, bookingId: booking.id,
    description: formatChargeDescription({
      playerName: args.player2.first_name,
      label: `Shared private w/ ${args.coachName} (+ ${args.player1.first_name})`,
      date: args.date,
    }),
    amountCents: args.halfPrice, status: 'confirmed', createdBy: args.adminUserId,
  })

  return { ok: true, bookingId: booking.id }
}

export async function adminCreateSharedPrivate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const familyId1 = formData.get('family_id_1') as string
  const playerId1 = formData.get('player_id_1') as string
  const familyId2 = formData.get('family_id_2') as string
  const playerId2 = formData.get('player_id_2') as string
  const coachId = formData.get('coach_id') as string
  const date = formData.get('date') as string
  const startTime = formData.get('start_time') as string
  const durationMinutes = parseInt(formData.get('duration_minutes') as string)
  const scheduleMode = (formData.get('schedule_mode') as string) || 'one_off'

  if (!familyId1 || !playerId1 || !familyId2 || !playerId2 || !coachId || !date || !startTime || !durationMinutes) {
    redirect('/admin/privates/bookings?error=All+fields+are+required')
  }
  if (playerId1 === playerId2) {
    redirect('/admin/privates/bookings?error=Pick+two+different+players')
  }

  // Verify both players belong to the claimed families
  const { data: player1 } = await supabase.from('players').select('id, first_name').eq('id', playerId1).eq('family_id', familyId1).single()
  if (!player1) redirect('/admin/privates/bookings?error=Player+1+not+found+in+selected+family')
  const { data: player2 } = await supabase.from('players').select('id, first_name').eq('id', playerId2).eq('family_id', familyId2).single()
  if (!player2) redirect('/admin/privates/bookings?error=Player+2+not+found+in+selected+family')

  const { data: coach } = await supabase.from('coaches').select('name').eq('id', coachId).single()
  const coachName = coach?.name ?? 'coach'

  // Pricing: full price split per family. Use family 1's pricing rules for parity with 1-on-1; halve for charges.
  const { getPrivatePrice } = await import('@/lib/utils/private-booking')
  const totalPriceCents = await getPrivatePrice(supabase, familyId1, coachId, durationMinutes)
  const halfPrice = Math.round(totalPriceCents / 2)

  const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])
  const endMinutes = startMinutes + durationMinutes
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

  const { getSessionUser } = await import('@/lib/supabase/server')
  const adminUser = await getSessionUser()
  const adminUserId = adminUser?.id ?? null

  const first = await createSharedPrivateInstance({
    supabase,
    familyId1, player1: { id: player1.id, first_name: player1.first_name },
    familyId2, player2: { id: player2.id, first_name: player2.first_name },
    coachId, coachName, date, startTime, endTime, durationMinutes,
    totalPriceCents, halfPrice, adminUserId,
    isStanding: scheduleMode === 'standing',
    parentBookingId: null,
  })
  if (!first.ok) redirect(`/admin/privates/bookings?error=${encodeURIComponent(first.error)}`)

  let count = 1
  if (scheduleMode === 'standing') {
    const { getStandingDates } = await import('@/lib/utils/private-booking')
    const dayOfWeek = new Date(date + 'T12:00:00').getDay()
    const futureDates = getStandingDates(dayOfWeek, date)

    for (const futureDate of futureDates) {
      const inst = await createSharedPrivateInstance({
        supabase,
        familyId1, player1: { id: player1.id, first_name: player1.first_name },
        familyId2, player2: { id: player2.id, first_name: player2.first_name },
        coachId, coachName, date: futureDate, startTime, endTime, durationMinutes,
        totalPriceCents, halfPrice, adminUserId,
        isStanding: true,
        parentBookingId: first.bookingId,
      })
      if (inst.ok) count++
    }
  }

  revalidatePath('/admin/privates/bookings')
  revalidatePath('/admin/privates')
  const msg = scheduleMode === 'standing'
    ? `${count}+weekly+shared+sessions+booked`
    : 'Shared+private+booked'
  redirect(`/admin/privates/bookings?success=${msg}`)
}
