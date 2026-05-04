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
  const coachId = (formData.get('coach_id') as string) || ''
  const coachQs = coachId ? `coach_id=${coachId}&` : ''
  if (ids.length === 0) redirect(`/admin/coaches/availability?${coachQs}error=Missing+ids`)

  const { error } = await supabase
    .from('coach_availability_exceptions')
    .delete()
    .in('id', ids)

  if (error) {
    redirect(`/admin/coaches/availability?${coachQs}error=${encodeURIComponent('Failed to remove exceptions')}`)
  }

  revalidatePath('/admin/coaches/availability')
  redirect(`/admin/coaches/availability?${coachQs}success=Exception+removed`)
}

// ── Admin: Stage-and-Save Availability ─────────────────────────────────

export async function adminApplyCoachAvailabilityChanges(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const coachId = formData.get('coach_id') as string
  if (!coachId) redirect('/admin/coaches/availability?error=Coach+is+required')

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
    redirect(`/admin/coaches/availability?coach_id=${coachId}`)
  }

  const { error } = await supabase.rpc('apply_coach_availability_changes', {
    p_coach_id: coachId,
    p_delete_ids: deleteIds,
    p_inserts: inserts,
  })

  if (error) {
    redirect(`/admin/coaches/availability?coach_id=${coachId}&error=${encodeURIComponent(error.message ?? 'Failed to save')}`)
  }

  revalidatePath('/admin/coaches/availability')
  redirect(`/admin/coaches/availability?coach_id=${coachId}&success=Availability+updated`)
}

export async function adminAddExceptionRange(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const coachId = formData.get('coach_id') as string
  if (!coachId) redirect('/admin/coaches/availability?error=Coach+is+required')

  const startDate = formData.get('start_date') as string
  const endDate = (formData.get('end_date') as string) || startDate
  const allDay = formData.get('all_day') === 'on'
  const startTime = allDay ? null : (formData.get('start_time') as string) || null
  const endTime = allDay ? null : (formData.get('end_time') as string) || null
  const reason = (formData.get('reason') as string) || null

  if (!startDate) {
    redirect(`/admin/coaches/availability?coach_id=${coachId}&error=Start+date+is+required`)
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
    redirect(`/admin/coaches/availability?coach_id=${coachId}&error=${encodeURIComponent(error.message ?? 'Failed to add')}`)
  }

  revalidatePath('/admin/coaches/availability')
  redirect(`/admin/coaches/availability?coach_id=${coachId}&success=Exception+added`)
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

// ── Admin: Bulk Allowed Coaches ────────────────────────────────────────

/**
 * Bulk-set the player_allowed_coaches list for many players at once.
 *
 * Modes:
 *   'replace' — each selected player's existing allowlist is wiped and
 *               replaced with the new (coachIds + autoApproveIds) set.
 *   'add'     — union the new (coachIds + autoApproveIds) onto each player's
 *               existing allowlist. Existing rows for the same (player, coach)
 *               pair are upserted (re-applies auto_approve from the form).
 *
 * Empty allowlist semantics match the per-family form: an empty
 * player_allowed_coaches set for a player means "no restrictions, can book
 * with any coach". Hitting Replace with no coaches selected therefore wipes
 * restrictions for the selected players.
 */
export async function bulkSetPlayerAllowedCoaches(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const playerIdsRaw = (formData.get('player_ids') as string) ?? ''
  const playerIds = playerIdsRaw.split(',').map(s => s.trim()).filter(Boolean)
  const coachIds = formData.getAll('coach_ids') as string[]
  const autoApproveIds = formData.getAll('auto_approve') as string[]
  const mode = (formData.get('mode') as string) === 'add' ? 'add' : 'replace'

  if (playerIds.length === 0) {
    redirect('/admin/privates?error=' + encodeURIComponent('Pick at least one player'))
  }

  if (mode === 'replace') {
    const { error } = await supabase
      .from('player_allowed_coaches')
      .delete()
      .in('player_id', playerIds)
    if (error) {
      redirect(`/admin/privates?error=${encodeURIComponent('Failed to clear existing allowlists: ' + error.message)}`)
    }
  }

  if (coachIds.length > 0) {
    const rows = playerIds.flatMap(pid =>
      coachIds.map(cid => ({
        player_id: pid,
        coach_id: cid,
        auto_approve: autoApproveIds.includes(cid),
      })),
    )

    if (mode === 'add') {
      // upsert on (player_id, coach_id) — re-applies auto_approve from the form.
      const { error } = await supabase
        .from('player_allowed_coaches')
        .upsert(rows, { onConflict: 'player_id,coach_id' })
      if (error) {
        redirect(`/admin/privates?error=${encodeURIComponent('Failed to add allowed coaches: ' + error.message)}`)
      }
    } else {
      const { error } = await supabase
        .from('player_allowed_coaches')
        .insert(rows)
      if (error) {
        redirect(`/admin/privates?error=${encodeURIComponent('Failed to set allowed coaches: ' + error.message)}`)
      }
    }
  }

  revalidatePath('/admin/families')
  revalidatePath('/admin/privates')
  revalidatePath('/parent/bookings')
  redirect(`/admin/privates?success=${encodeURIComponent(`Updated ${playerIds.length} player${playerIds.length === 1 ? '' : 's'}`)}`)
}

// ── Admin: Family private-rate overrides (read) ────────────────────────

export type FamilyPrivateOverride = {
  coachId: string | null
  per30Cents: number
  validUntil: string | null
}

/**
 * Returns active per-coach private-rate overrides for a family. Used by the
 * admin Book Private modal to display the family's grandfathered rate next
 * to (and instead of) the coach default rate.
 *
 * Rows with `coach_id` set are per-coach overrides. A row with `coach_id IS NULL`
 * is the family-wide all-private override and applies to coaches without a
 * specific row. `per_session_cents` is interpreted as PER 30 MIN.
 */
export async function getFamilyPrivateRateOverrides(familyId: string): Promise<FamilyPrivateOverride[]> {
  await requireAdmin()
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('family_pricing')
    .select('coach_id, per_session_cents, valid_until, valid_from')
    .eq('family_id', familyId)
    .eq('program_type', 'private')
    .lte('valid_from', today)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .not('per_session_cents', 'is', null)

  if (error) {
    console.error('getFamilyPrivateRateOverrides failed:', error.message)
    return []
  }

  return (data ?? [])
    .filter(r => r.per_session_cents != null)
    .map(r => ({
      coachId: r.coach_id ?? null,
      per30Cents: r.per_session_cents as number,
      validUntil: r.valid_until ?? null,
    }))
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

  // Mask the coach slot so it doesn't auto-reappear as available.
  {
    const { maskCoachSlotOnAdminOrCoachCancel } = await import('@/lib/private-cancel')
    await maskCoachSlotOnAdminOrCoachCancel(supabase, booking.session_id!, 'Admin declined booking')
  }

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
  const { maskCoachSlotOnAdminOrCoachCancel } = await import('@/lib/private-cancel')

  for (const bookingId of ids) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, session_id, family_id, approval_status')
      .eq('id', bookingId)
      .single()

    if (!booking || booking.approval_status !== 'pending') continue

    await supabase.from('bookings').update({ status: 'cancelled', approval_status: 'declined' }).eq('id', bookingId)
    await supabase.from('sessions').update({ status: 'cancelled', cancellation_reason: 'Declined by admin' }).eq('id', booking.session_id!)
    await maskCoachSlotOnAdminOrCoachCancel(supabase, booking.session_id!, 'Admin declined booking')

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
  const { buildPricingBreakdown } = await import('@/lib/utils/player-pricing')
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
    pricingBreakdown: buildPricingBreakdown({
      basePriceCents: args.priceCents,
      perSessionPriceCents: args.priceCents,
      morningSquadPartnerApplied: false,
      multiGroupApplied: false,
      sessions: 1,
    }) as never,
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
  parentBookingIdA: string | null
  parentBookingIdB: string | null
}): Promise<{ ok: true; bookingIdA: string; bookingIdB: string } | { ok: false; error: string }> {
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

  // Booking A — family 1's view of this shared session.
  const { data: bookingA } = await supabase
    .from('bookings')
    .insert({
      family_id: args.familyId1, player_id: args.player1.id,
      session_id: session.id, booking_type: 'private',
      status: 'confirmed', approval_status: 'approved', auto_approved: true,
      approved_by: args.adminUserId, approved_at: new Date().toISOString(),
      price_cents: args.halfPrice, duration_minutes: args.durationMinutes,
      booked_by: args.adminUserId,
      is_standing: args.isStanding,
      standing_parent_id: args.parentBookingIdA,
    })
    .select('id')
    .single()
  if (!bookingA) {
    await supabase.from('sessions').delete().eq('id', session.id)
    return { ok: false, error: 'Failed to create booking (family 1)' }
  }

  // Booking B — family 2's view, linked to A.
  const { data: bookingB } = await supabase
    .from('bookings')
    .insert({
      family_id: args.familyId2, player_id: args.player2.id,
      session_id: session.id, booking_type: 'private',
      status: 'confirmed', approval_status: 'approved', auto_approved: true,
      approved_by: args.adminUserId, approved_at: new Date().toISOString(),
      price_cents: args.halfPrice, duration_minutes: args.durationMinutes,
      booked_by: args.adminUserId,
      is_standing: args.isStanding,
      standing_parent_id: args.parentBookingIdB,
      shared_with_booking_id: bookingA.id,
    })
    .select('id')
    .single()
  if (!bookingB) {
    await supabase.from('bookings').delete().eq('id', bookingA.id)
    await supabase.from('sessions').delete().eq('id', session.id)
    return { ok: false, error: 'Failed to create booking (family 2)' }
  }

  // Close the loop: A points back at B.
  await supabase
    .from('bookings')
    .update({ shared_with_booking_id: bookingB.id })
    .eq('id', bookingA.id)

  const { createCharge, formatChargeDescription } = await import('@/lib/utils/billing')
  const { buildPricingBreakdown } = await import('@/lib/utils/player-pricing')
  const sharedBreakdown = buildPricingBreakdown({
    basePriceCents: args.halfPrice,
    perSessionPriceCents: args.halfPrice,
    morningSquadPartnerApplied: false,
    multiGroupApplied: false,
    sessions: 1,
  })
  await createCharge(supabase, {
    familyId: args.familyId1, playerId: args.player1.id,
    type: 'private', sourceType: 'enrollment',
    sessionId: session.id, bookingId: bookingA.id,
    description: formatChargeDescription({
      playerName: args.player1.first_name,
      label: `Shared private w/ ${args.coachName} (+ ${args.player2.first_name})`,
      date: args.date,
    }),
    amountCents: args.halfPrice, status: 'confirmed', createdBy: args.adminUserId,
    pricingBreakdown: sharedBreakdown as never,
  })
  await createCharge(supabase, {
    familyId: args.familyId2, playerId: args.player2.id,
    type: 'private', sourceType: 'enrollment',
    sessionId: session.id, bookingId: bookingB.id,
    description: formatChargeDescription({
      playerName: args.player2.first_name,
      label: `Shared private w/ ${args.coachName} (+ ${args.player1.first_name})`,
      date: args.date,
    }),
    amountCents: args.halfPrice, status: 'confirmed', createdBy: args.adminUserId,
    pricingBreakdown: sharedBreakdown as never,
  })

  return { ok: true, bookingIdA: bookingA.id, bookingIdB: bookingB.id }
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
    parentBookingIdA: null,
    parentBookingIdB: null,
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
        parentBookingIdA: first.bookingIdA,
        parentBookingIdB: first.bookingIdB,
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

// ── Admin: Cancel / Modify / Void a Private Series ─────────────────────

/**
 * Resolve the full id-set of bookings + sessions in a series, including
 * paired-shared rows. Returns booking ids, session ids, and the families
 * touched (for revalidate + balance recompute).
 */
async function resolvePrivateSeriesIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentBookingId: string,
): Promise<{ bookingIds: string[]; sessionIds: string[]; familyIds: string[] }> {
  // The "series" is: the parent booking + every booking with standing_parent_id = parent
  // + every booking paired (shared_with_booking_id) with any of the above.
  const { data: chainRows } = await supabase
    .from('bookings')
    .select('id, family_id, session_id, shared_with_booking_id')
    .or(`id.eq.${parentBookingId},standing_parent_id.eq.${parentBookingId}`)

  const seedIds = new Set<string>()
  const sessionIds = new Set<string>()
  const familyIds = new Set<string>()
  for (const r of chainRows ?? []) {
    seedIds.add(r.id)
    if (r.session_id) sessionIds.add(r.session_id)
    familyIds.add(r.family_id)
    if (r.shared_with_booking_id) seedIds.add(r.shared_with_booking_id)
  }

  if (seedIds.size > 0) {
    const { data: pairs } = await supabase
      .from('bookings')
      .select('id, family_id, session_id, shared_with_booking_id')
      .in('id', [...seedIds])
    for (const r of pairs ?? []) {
      seedIds.add(r.id)
      if (r.session_id) sessionIds.add(r.session_id)
      familyIds.add(r.family_id)
    }
  }

  return {
    bookingIds: [...seedIds],
    sessionIds: [...sessionIds],
    familyIds: [...familyIds],
  }
}

/**
 * Cancel every still-scheduled session in a private series. Voids the matching
 * charges (full credit) and notifies each family.
 */
export async function cancelPrivateSeries(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parentBookingId = formData.get('parent_booking_id') as string
  if (!parentBookingId) redirect('/admin/privates?error=Booking+is+required')

  const { bookingIds, sessionIds, familyIds } = await resolvePrivateSeriesIds(supabase, parentBookingId)
  if (bookingIds.length === 0) redirect('/admin/privates?error=Series+not+found')

  // Only act on sessions that are still scheduled.
  const { data: scheduledSessions } = await supabase
    .from('sessions')
    .select('id')
    .in('id', sessionIds)
    .eq('status', 'scheduled')

  const scheduledIds = (scheduledSessions ?? []).map(s => s.id)
  if (scheduledIds.length === 0) {
    redirect('/admin/privates?error=No+scheduled+sessions+to+cancel')
  }

  // Mark sessions cancelled
  await supabase
    .from('sessions')
    .update({ status: 'cancelled', cancellation_reason: 'Cancelled by admin (series)' })
    .in('id', scheduledIds)

  // Cancel matching bookings
  await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancellation_type: 'admin' })
    .in('id', bookingIds)
    .in('session_id', scheduledIds)

  // Mask each cancelled slot so it doesn't auto-restore on coach availability.
  {
    const { maskCoachSlotOnAdminOrCoachCancel } = await import('@/lib/private-cancel')
    for (const sid of scheduledIds) {
      await maskCoachSlotOnAdminOrCoachCancel(supabase, sid, 'Admin cancelled series')
    }
  }

  // Void charges for those sessions
  const { voidCharge } = await import('@/lib/utils/billing')
  const { data: chargesToVoid } = await supabase
    .from('charges')
    .select('id, family_id')
    .in('booking_id', bookingIds)
    .in('session_id', scheduledIds)
    .in('status', ['pending', 'confirmed'])

  for (const c of chargesToVoid ?? []) {
    await voidCharge(supabase, c.id, c.family_id)
  }

  // Notify each affected family
  const { notifyFamily } = await import('@/lib/notifications/notify')
  for (const familyId of familyIds) {
    await notifyFamily(familyId, {
      title: 'Private Lessons Cancelled',
      body: `${scheduledIds.length} upcoming private session${scheduledIds.length === 1 ? '' : 's'} cancelled. Full credit applied.`,
      url: '/parent/bookings',
      type: 'rain_cancel',
    }).catch(() => undefined)
  }

  revalidatePath('/admin/privates')
  revalidatePath('/admin')
  redirect(`/admin/privates?success=Cancelled+${scheduledIds.length}+session(s)`)
}

/**
 * Modify coach OR player on a private series, optionally only from a date forward.
 */
export async function modifyPrivateSeries(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parentBookingId = formData.get('parent_booking_id') as string
  const newCoachId = (formData.get('new_coach_id') as string) || ''
  const newPlayerId = (formData.get('new_player_id') as string) || ''
  const fromDate = (formData.get('from_date') as string) || new Date().toISOString().split('T')[0]

  if (!parentBookingId) redirect('/admin/privates?error=Booking+is+required')
  if (!newCoachId && !newPlayerId) redirect('/admin/privates?error=Pick+a+coach+or+player+to+change')

  const { bookingIds, sessionIds } = await resolvePrivateSeriesIds(supabase, parentBookingId)

  // Limit scope to sessions on/after fromDate that are still scheduled.
  const { data: futureSessions } = await supabase
    .from('sessions')
    .select('id, date, coach_id')
    .in('id', sessionIds)
    .eq('status', 'scheduled')
    .gte('date', fromDate)

  const futureIds = (futureSessions ?? []).map(s => s.id)
  if (futureIds.length === 0) redirect('/admin/privates?error=No+future+sessions+from+that+date')

  if (newCoachId) {
    await supabase.from('sessions').update({ coach_id: newCoachId }).in('id', futureIds)
    // Recompute coach earnings down the line on session complete; nothing to do now.
  }

  if (newPlayerId) {
    // Player change applies to the booking row whose family owns the new player.
    const { data: newPlayer } = await supabase
      .from('players')
      .select('id, family_id, first_name')
      .eq('id', newPlayerId)
      .single()
    if (!newPlayer) redirect('/admin/privates?error=Player+not+found')

    // Find the booking row in the series belonging to that family
    const { data: targetBookings } = await supabase
      .from('bookings')
      .select('id, family_id')
      .in('id', bookingIds)
      .in('session_id', futureIds)
      .eq('family_id', newPlayer.family_id)

    if (!targetBookings || targetBookings.length === 0) {
      redirect('/admin/privates?error=Selected+player%27s+family+is+not+on+this+series')
    }

    const targetIds = targetBookings.map(b => b.id)
    await supabase.from('bookings').update({ player_id: newPlayerId }).in('id', targetIds)
    // Update charges' player + description prefix to match new player name
    const { data: charges } = await supabase
      .from('charges')
      .select('id, description')
      .in('booking_id', targetIds)
      .in('session_id', futureIds)

    for (const c of charges ?? []) {
      const desc = (c.description ?? '').replace(/^([^—]+) —/, `${newPlayer.first_name} —`)
      await supabase.from('charges').update({ player_id: newPlayerId, description: desc }).eq('id', c.id)
    }
  }

  revalidatePath('/admin/privates')
  redirect(`/admin/privates?success=Updated+${futureIds.length}+session(s)`)
}

/**
 * Void a private booking series. Hard-deletes via the admin_void_private_series RPC.
 * For test data cleanup. Includes completed sessions when include_completed=true.
 */
export async function voidPrivateSeries(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parentBookingId = formData.get('parent_booking_id') as string
  const includeCompleted = formData.get('include_completed') === 'on'
  const confirmString = (formData.get('confirm') as string) ?? ''

  if (!parentBookingId) redirect('/admin/privates?error=Booking+is+required')
  if (confirmString.trim().toUpperCase() !== 'DELETE') {
    redirect('/admin/privates?error=Type+DELETE+to+confirm+void')
  }

  const { error } = await supabase.rpc('admin_void_private_series', {
    p_parent_booking_id: parentBookingId,
    p_include_completed: includeCompleted,
  })

  if (error) {
    console.error('voidPrivateSeries failed:', error.message)
    redirect(`/admin/privates?error=${encodeURIComponent('Void failed')}`)
  }

  revalidatePath('/admin/privates')
  revalidatePath('/admin')
  redirect('/admin/privates?success=Series+voided')
}

// ── Admin / Coach: Convert Shared → Solo for one session ───────────────

/**
 * One player no-shows / cancels late on a shared private. The session still
 * runs as a solo with the remaining player, who pays the full private rate.
 * The cancelled family's charge is voided (full credit) and a top-up charge
 * is added to the remaining family for the rate difference.
 */
export async function convertSharedToSolo(formData: FormData) {
  // Admin OR the coach assigned to the session may call this.
  const supabase = await createClient()
  const { getSessionUser } = await import('@/lib/supabase/server')
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const sessionId = formData.get('session_id') as string
  const removingPlayerIdRaw = formData.get('removing_player_id') as string
  const knownPrimaryPlayerId = (formData.get('primary_player_id') as string) || ''
  const reason = (formData.get('reason') as string) || 'Partner cancelled'

  if (!sessionId || !removingPlayerIdRaw) {
    redirect('/admin/privates?error=Session+and+player+are+required')
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, date, coach_id, duration_minutes, status, coaches:coach_id(name, user_id)')
    .eq('id', sessionId)
    .single()
  if (!session) redirect('/admin/privates?error=Session+not+found')
  if (session.status !== 'scheduled') {
    redirect('/admin/privates?error=Only+scheduled+sessions+can+be+converted')
  }

  // Authorisation: admin OR the coach owning this session.
  const { data: adminCheck } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()
  const sessionCoach = session.coaches as unknown as { user_id: string | null } | null
  const isCoachOfSession = sessionCoach?.user_id === user.id
  if (!adminCheck && !isCoachOfSession) {
    redirect('/coach/privates?error=Not+allowed')
  }

  const { data: rows } = await supabase
    .from('bookings')
    .select('id, family_id, player_id, price_cents, players!bookings_player_id_fkey(first_name)')
    .eq('session_id', sessionId)
    .eq('booking_type', 'private')

  const bookings = (rows ?? []) as Array<{
    id: string
    family_id: string
    player_id: string
    price_cents: number
    players: { first_name: string } | null
  }>

  if (bookings.length !== 2) {
    redirect('/admin/privates?error=Not+a+shared+session')
  }

  // Resolve "__partner__" sentinel: the partner is the booking whose player_id
  // is not the known primary's. If the form sends a real player_id, use it directly.
  let resolvedRemovingPlayerId = removingPlayerIdRaw
  if (removingPlayerIdRaw === '__partner__') {
    const partner = bookings.find(b => b.player_id !== knownPrimaryPlayerId)
    if (!partner) redirect('/admin/privates?error=Could+not+resolve+partner')
    resolvedRemovingPlayerId = partner.player_id
  }

  const removing = bookings.find(b => b.player_id === resolvedRemovingPlayerId)
  const remaining = bookings.find(b => b.player_id !== resolvedRemovingPlayerId)
  if (!removing || !remaining) redirect('/admin/privates?error=Player+not+on+this+session')

  // Cancel the removing booking
  await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancellation_type: 'no_show' })
    .eq('id', removing.id)

  // Void the removing family's charge
  const { voidCharge, createCharge, formatChargeDescription } = await import('@/lib/utils/billing')
  const { data: removingCharge } = await supabase
    .from('charges')
    .select('id')
    .eq('booking_id', removing.id)
    .eq('session_id', sessionId)
    .in('status', ['pending', 'confirmed'])
    .single()
  if (removingCharge) {
    await voidCharge(supabase, removingCharge.id, removing.family_id)
  }

  // Top-up the remaining family. Full price = 2 * each-side; top-up = remaining.price_cents.
  // (price_cents on the booking row is the half-rate per the new schema; doubling it = full solo rate.)
  const topUpCents = remaining.price_cents

  await createCharge(supabase, {
    familyId: remaining.family_id,
    playerId: remaining.player_id,
    type: 'private',
    sourceType: 'enrollment',
    sessionId,
    bookingId: remaining.id,
    description: formatChargeDescription({
      playerName: remaining.players?.first_name,
      label: `Solo private rate (partner cancelled)`,
      date: session.date,
    }),
    amountCents: topUpCents,
    status: 'confirmed',
    createdBy: user.id,
  })

  // Notify the remaining family
  const { notifyFamily } = await import('@/lib/notifications/notify')
  await notifyFamily(remaining.family_id, {
    title: 'Shared Private Became a Solo',
    body: `Partner cancelled — your ${session.date} session is now a solo at the full private rate. Top-up charge added.`,
    url: '/parent/bookings',
    type: 'announcement',
  }).catch(() => undefined)

  // Notify the removing family
  await notifyFamily(removing.family_id, {
    title: 'Booking Cancelled',
    body: `Your shared private on ${session.date} was cancelled. Full credit applied. Reason: ${reason}.`,
    url: '/parent/bookings',
    type: 'rain_cancel',
  }).catch(() => undefined)

  revalidatePath('/admin/privates')
  revalidatePath('/admin')
  revalidatePath('/coach/privates')
  revalidatePath(`/coach/privates/${sessionId}`)
  const successPath = adminCheck
    ? '/admin/privates?success=Converted+to+solo'
    : `/coach/privates/${sessionId}?success=Converted+to+solo`
  redirect(successPath)
}
