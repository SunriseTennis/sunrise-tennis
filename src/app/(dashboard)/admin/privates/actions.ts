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
