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

export async function adminBookPrivate(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const familyId = formData.get('family_id') as string
  const coachId = formData.get('coach_id') as string
  const playerName = (formData.get('player_name') as string)?.trim()
  const date = formData.get('date') as string
  const startTime = formData.get('start_time') as string
  const durationMinutes = parseInt(formData.get('duration_minutes') as string)

  if (!familyId || !coachId || !playerName || !date || !startTime || !durationMinutes) {
    redirect('/admin/privates/bookings?error=All+fields+are+required')
  }

  // Find the player by name in this family
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name')
    .eq('family_id', familyId)
    .ilike('first_name', playerName)
    .single()

  if (!player) {
    redirect(`/admin/privates/bookings?error=${encodeURIComponent(`Player "${playerName}" not found in this family`)}`)
  }

  // Get coach name
  const { data: coach } = await supabase
    .from('coaches')
    .select('name')
    .eq('id', coachId)
    .single()

  // Calculate price
  const { getPrivatePrice } = await import('@/lib/utils/private-booking')
  const priceCents = await getPrivatePrice(supabase, coachId, durationMinutes)

  // Calculate end time
  const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])
  const endMinutes = startMinutes + durationMinutes
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

  // Create session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      session_type: 'private',
      date,
      start_time: startTime,
      end_time: endTime,
      coach_id: coachId,
      status: 'scheduled',
      duration_minutes: durationMinutes,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    redirect(`/admin/privates/bookings?error=${encodeURIComponent('Failed to create session')}`)
  }

  // Create booking (auto-confirmed since admin is booking)
  const { getSessionUser } = await import('@/lib/supabase/server')
  const adminUser = await getSessionUser()

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      family_id: familyId,
      player_id: player.id,
      session_id: session.id,
      booking_type: 'private',
      status: 'confirmed',
      approval_status: 'approved',
      auto_approved: true,
      approved_by: adminUser?.id ?? null,
      approved_at: new Date().toISOString(),
      price_cents: priceCents,
      duration_minutes: durationMinutes,
      booked_by: adminUser?.id ?? null,
    })
    .select('id')
    .single()

  if (bookingError || !booking) {
    await supabase.from('sessions').delete().eq('id', session.id)
    redirect(`/admin/privates/bookings?error=${encodeURIComponent('Failed to create booking')}`)
  }

  // Create charge
  const { createCharge } = await import('@/lib/utils/billing')
  await createCharge(supabase, {
    familyId,
    playerId: player.id,
    type: 'private',
    sourceType: 'enrollment',
    sessionId: session.id,
    bookingId: booking.id,
    description: `Private lesson with ${coach?.name ?? 'coach'} - ${date}`,
    amountCents: priceCents,
    status: 'confirmed',
    createdBy: adminUser?.id ?? null,
  })

  revalidatePath('/admin/privates/bookings')
  redirect('/admin/privates/bookings?success=Private+lesson+booked')
}

// ── Admin: Shared Private (2 players, possibly different families) ─────

export async function adminCreateSharedPrivate(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const familyId1 = formData.get('family_id_1') as string
  const playerName1 = (formData.get('player_name_1') as string)?.trim()
  const familyId2 = formData.get('family_id_2') as string
  const playerName2 = (formData.get('player_name_2') as string)?.trim()
  const coachId = formData.get('coach_id') as string
  const date = formData.get('date') as string
  const startTime = formData.get('start_time') as string
  const durationMinutes = parseInt(formData.get('duration_minutes') as string)

  if (!familyId1 || !playerName1 || !familyId2 || !playerName2 || !coachId || !date || !startTime || !durationMinutes) {
    redirect('/admin/privates/bookings?error=All+fields+are+required')
  }

  // Find both players
  const { data: player1 } = await supabase.from('players').select('id, first_name').eq('family_id', familyId1).ilike('first_name', playerName1).single()
  if (!player1) redirect(`/admin/privates/bookings?error=${encodeURIComponent(`Player "${playerName1}" not found`)}`)

  const { data: player2 } = await supabase.from('players').select('id, first_name').eq('family_id', familyId2).ilike('first_name', playerName2).single()
  if (!player2) redirect(`/admin/privates/bookings?error=${encodeURIComponent(`Player "${playerName2}" not found`)}`)

  const { data: coach } = await supabase.from('coaches').select('name').eq('id', coachId).single()

  // Calculate price — full price, split between families
  const { getPrivatePrice } = await import('@/lib/utils/private-booking')
  const totalPriceCents = await getPrivatePrice(supabase, coachId, durationMinutes)
  const halfPrice = Math.round(totalPriceCents / 2)

  const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])
  const endMinutes = startMinutes + durationMinutes
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

  // Create one session
  const { data: session } = await supabase
    .from('sessions')
    .insert({ session_type: 'private', date, start_time: startTime, end_time: endTime, coach_id: coachId, status: 'scheduled', duration_minutes: durationMinutes })
    .select('id')
    .single()

  if (!session) redirect('/admin/privates/bookings?error=Failed+to+create+session')

  const { getSessionUser } = await import('@/lib/supabase/server')
  const adminUser = await getSessionUser()

  // Create booking with second player/family
  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      family_id: familyId1, player_id: player1.id,
      second_player_id: player2.id, second_family_id: familyId2,
      session_id: session.id, booking_type: 'private',
      status: 'confirmed', approval_status: 'approved', auto_approved: true,
      approved_by: adminUser?.id ?? null, approved_at: new Date().toISOString(),
      price_cents: totalPriceCents, duration_minutes: durationMinutes,
      booked_by: adminUser?.id ?? null,
    })
    .select('id')
    .single()

  if (!booking) {
    await supabase.from('sessions').delete().eq('id', session.id)
    redirect('/admin/privates/bookings?error=Failed+to+create+booking')
  }

  // Create two charges — one per family, each for half
  const { createCharge } = await import('@/lib/utils/billing')
  const coachName = coach?.name ?? 'coach'

  await createCharge(supabase, {
    familyId: familyId1, playerId: player1.id,
    type: 'private', sourceType: 'enrollment',
    sessionId: session.id, bookingId: booking.id,
    description: `Shared private with ${coachName} (${player1.first_name} + ${player2.first_name}) - ${date}`,
    amountCents: halfPrice, status: 'confirmed', createdBy: adminUser?.id ?? null,
  })

  await createCharge(supabase, {
    familyId: familyId2, playerId: player2.id,
    type: 'private', sourceType: 'enrollment',
    sessionId: session.id, bookingId: booking.id,
    description: `Shared private with ${coachName} (${player2.first_name} + ${player1.first_name}) - ${date}`,
    amountCents: halfPrice, status: 'confirmed', createdBy: adminUser?.id ?? null,
  })

  revalidatePath('/admin/privates/bookings')
  redirect('/admin/privates/bookings?success=Shared+private+booked')
}
