'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'

export async function updateCoach(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const coachId = formData.get('coach_id') as string
  const name = (formData.get('name') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim() || null
  const email = (formData.get('email') as string)?.trim() || null
  const groupRateStr = formData.get('group_rate') as string
  const privateRateStr = formData.get('private_rate') as string
  const payPeriod = formData.get('pay_period') as string
  // Checkbox: present (any truthy value) means delivers_privates = true.
  // Form must include a hidden 'delivers_privates_present=1' so we can tell
  // "absent because unchecked" from "absent because field not on this form".
  const deliversFlagPresent = formData.get('delivers_privates_present') === '1'
  const deliversPrivates = formData.get('delivers_privates') === 'on'

  if (!coachId || !name) return

  const groupRateCents = groupRateStr ? Math.round(parseFloat(groupRateStr) * 100) : 0
  const privateRateCents = privateRateStr ? Math.round(parseFloat(privateRateStr) * 100) : 0

  type CoachUpdate = {
    name: string
    phone: string | null
    email: string | null
    hourly_rate: { group_rate_cents: number; private_rate_cents: number }
    pay_period: string
    delivers_privates?: boolean
  }
  const update: CoachUpdate = {
    name,
    phone,
    email,
    hourly_rate: { group_rate_cents: groupRateCents, private_rate_cents: privateRateCents },
    pay_period: payPeriod || 'weekly',
  }
  if (deliversFlagPresent) update.delivers_privates = deliversPrivates

  const { error } = await supabase
    .from('coaches')
    .update(update)
    .eq('id', coachId)

  if (error) {
    console.error('Failed to update coach:', error.message)
  }

  revalidatePath(`/admin/coaches/${coachId}`)
  revalidatePath('/admin/coaches')
  revalidatePath('/admin')
  revalidatePath('/parent/bookings')
}

export async function createCoach(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const name = (formData.get('name') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim() || null
  const email = (formData.get('email') as string)?.trim() || null
  const groupRateStr = formData.get('group_rate') as string
  const privateRateStr = formData.get('private_rate') as string
  const payPeriod = (formData.get('pay_period') as string) || 'weekly'
  const deliversPrivates = formData.get('delivers_privates') === 'on'

  if (!name) {
    redirect('/admin/coaches?error=' + encodeURIComponent('Name is required'))
  }

  const groupRateCents = groupRateStr ? Math.round(parseFloat(groupRateStr) * 100) : 0
  const privateRateCents = privateRateStr ? Math.round(parseFloat(privateRateStr) * 100) : 0

  const { data, error } = await supabase
    .from('coaches')
    .insert({
      name,
      phone,
      email,
      hourly_rate: { group_rate_cents: groupRateCents, private_rate_cents: privateRateCents },
      pay_period: payPeriod,
      status: 'active',
      is_owner: false,
      delivers_privates: deliversPrivates,
    })
    .select('id')
    .single()

  if (error || !data) {
    redirect('/admin/coaches?error=' + encodeURIComponent(error?.message || 'Failed to create coach'))
  }

  revalidatePath('/admin/coaches')
  revalidatePath('/admin')
  revalidatePath('/parent/bookings')
  redirect(`/admin/coaches/${data.id}?success=${encodeURIComponent('Coach created')}`)
}

export async function assignCoachAsAssistant(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const coachId = formData.get('coach_id') as string
  const programId = formData.get('program_id') as string

  if (!coachId || !programId) {
    redirect(`/admin/coaches/${coachId ?? ''}?error=${encodeURIComponent('Missing fields')}`)
  }

  // Idempotent upsert: respect any existing primary assignment, only insert assistant.
  const { data: existing } = await supabase
    .from('program_coaches')
    .select('id, role')
    .eq('coach_id', coachId)
    .eq('program_id', programId)
    .maybeSingle()

  if (existing) {
    redirect(`/admin/coaches/${coachId}?error=${encodeURIComponent('Coach already assigned to this program')}`)
  }

  const { error } = await supabase
    .from('program_coaches')
    .insert({ coach_id: coachId, program_id: programId, role: 'assistant' })

  if (error) {
    redirect(`/admin/coaches/${coachId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/coaches/${coachId}`)
  revalidatePath(`/admin/programs/${programId}`)
  redirect(`/admin/coaches/${coachId}?success=${encodeURIComponent('Assistant assigned')}`)
}

export async function unassignCoachFromProgram(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const coachId = formData.get('coach_id') as string
  const programId = formData.get('program_id') as string

  if (!coachId || !programId) {
    redirect(`/admin/coaches/${coachId ?? ''}?error=${encodeURIComponent('Missing fields')}`)
  }

  // Only remove assistant rows here — primary changes happen on the program detail page.
  const { error } = await supabase
    .from('program_coaches')
    .delete()
    .eq('coach_id', coachId)
    .eq('program_id', programId)
    .eq('role', 'assistant')

  if (error) {
    redirect(`/admin/coaches/${coachId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/coaches/${coachId}`)
  revalidatePath(`/admin/programs/${programId}`)
  redirect(`/admin/coaches/${coachId}?success=${encodeURIComponent('Removed from program')}`)
}
