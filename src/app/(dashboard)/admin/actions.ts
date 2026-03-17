'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// ── Families ────────────────────────────────────────────────────────────

export async function createFamily(formData: FormData) {
  const supabase = await createClient()

  // Generate next display_id (C001, C002, etc.)
  const { data: lastFamily } = await supabase
    .from('families')
    .select('display_id')
    .order('display_id', { ascending: false })
    .limit(1)
    .single()

  let nextNum = 1
  if (lastFamily?.display_id) {
    const match = lastFamily.display_id.match(/C(\d+)/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  const displayId = `C${String(nextNum).padStart(3, '0')}`

  const familyName = formData.get('family_name') as string
  const contactName = formData.get('contact_name') as string
  const contactPhone = formData.get('contact_phone') as string
  const contactEmail = formData.get('contact_email') as string
  const address = formData.get('address') as string
  const referredBy = formData.get('referred_by') as string

  const primaryContact = {
    name: contactName,
    phone: contactPhone || undefined,
    email: contactEmail || undefined,
  }

  const { data, error } = await supabase
    .from('families')
    .insert({
      display_id: displayId,
      family_name: familyName,
      primary_contact: primaryContact,
      address: address || null,
      referred_by: referredBy || null,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    redirect(`/admin/families/new?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/families')
  redirect(`/admin/families/${data.id}`)
}

export async function updateFamily(id: string, formData: FormData) {
  const supabase = await createClient()

  const familyName = formData.get('family_name') as string
  const contactName = formData.get('contact_name') as string
  const contactPhone = formData.get('contact_phone') as string
  const contactEmail = formData.get('contact_email') as string
  const address = formData.get('address') as string
  const status = formData.get('status') as string
  const notes = formData.get('notes') as string

  const primaryContact = {
    name: contactName,
    phone: contactPhone || undefined,
    email: contactEmail || undefined,
  }

  const { error } = await supabase
    .from('families')
    .update({
      family_name: familyName,
      primary_contact: primaryContact,
      address: address || null,
      status,
      notes: notes || null,
    })
    .eq('id', id)

  if (error) {
    redirect(`/admin/families/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/families/${id}`)
  revalidatePath('/admin/families')
  redirect(`/admin/families/${id}`)
}

// ── Players ─────────────────────────────────────────────────────────────

export async function createPlayer(familyId: string, formData: FormData) {
  const supabase = await createClient()

  const firstName = formData.get('first_name') as string
  const lastName = formData.get('last_name') as string
  const dob = formData.get('dob') as string
  const ballColor = formData.get('ball_color') as string
  const level = formData.get('level') as string
  const medicalNotes = formData.get('medical_notes') as string

  const { error } = await supabase
    .from('players')
    .insert({
      family_id: familyId,
      first_name: firstName,
      last_name: lastName,
      dob: dob || null,
      ball_color: ballColor || null,
      level: level || null,
      medical_notes: medicalNotes || null,
      status: 'active',
    })

  if (error) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}`)
}

export async function updatePlayer(playerId: string, familyId: string, formData: FormData) {
  const supabase = await createClient()

  const firstName = formData.get('first_name') as string
  const lastName = formData.get('last_name') as string
  const dob = formData.get('dob') as string
  const ballColor = formData.get('ball_color') as string
  const level = formData.get('level') as string
  const medicalNotes = formData.get('medical_notes') as string
  const currentFocus = formData.get('current_focus') as string
  const shortTermGoal = formData.get('short_term_goal') as string
  const longTermGoal = formData.get('long_term_goal') as string

  const { error } = await supabase
    .from('players')
    .update({
      first_name: firstName,
      last_name: lastName,
      dob: dob || null,
      ball_color: ballColor || null,
      level: level || null,
      medical_notes: medicalNotes || null,
      current_focus: currentFocus ? currentFocus.split(',').map((s) => s.trim()) : null,
      short_term_goal: shortTermGoal || null,
      long_term_goal: longTermGoal || null,
    })
    .eq('id', playerId)

  if (error) {
    redirect(`/admin/families/${familyId}/players/${playerId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/families/${familyId}/players/${playerId}`)
  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}/players/${playerId}`)
}

// ── Programs ────────────────────────────────────────────────────────────

export async function createProgram(formData: FormData) {
  const supabase = await createClient()

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const level = formData.get('level') as string
  const dayOfWeek = formData.get('day_of_week') as string
  const startTime = formData.get('start_time') as string
  const endTime = formData.get('end_time') as string
  const maxCapacity = formData.get('max_capacity') as string
  const perSessionCents = formData.get('per_session_dollars') as string
  const termFeeCents = formData.get('term_fee_dollars') as string
  const description = formData.get('description') as string

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const { data, error } = await supabase
    .from('programs')
    .insert({
      name,
      type,
      level,
      day_of_week: dayOfWeek ? parseInt(dayOfWeek, 10) : null,
      start_time: startTime || null,
      end_time: endTime || null,
      max_capacity: maxCapacity ? parseInt(maxCapacity, 10) : null,
      per_session_cents: perSessionCents ? Math.round(parseFloat(perSessionCents) * 100) : null,
      term_fee_cents: termFeeCents ? Math.round(parseFloat(termFeeCents) * 100) : null,
      description: description || null,
      slug,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    redirect(`/admin/programs/new?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/programs')
  redirect(`/admin/programs/${data.id}`)
}

export async function updateProgram(id: string, formData: FormData) {
  const supabase = await createClient()

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const level = formData.get('level') as string
  const dayOfWeek = formData.get('day_of_week') as string
  const startTime = formData.get('start_time') as string
  const endTime = formData.get('end_time') as string
  const maxCapacity = formData.get('max_capacity') as string
  const perSessionCents = formData.get('per_session_dollars') as string
  const termFeeCents = formData.get('term_fee_dollars') as string
  const description = formData.get('description') as string
  const status = formData.get('status') as string

  const { error } = await supabase
    .from('programs')
    .update({
      name,
      type,
      level,
      day_of_week: dayOfWeek ? parseInt(dayOfWeek, 10) : null,
      start_time: startTime || null,
      end_time: endTime || null,
      max_capacity: maxCapacity ? parseInt(maxCapacity, 10) : null,
      per_session_cents: perSessionCents ? Math.round(parseFloat(perSessionCents) * 100) : null,
      term_fee_cents: termFeeCents ? Math.round(parseFloat(termFeeCents) * 100) : null,
      description: description || null,
      status,
    })
    .eq('id', id)

  if (error) {
    redirect(`/admin/programs/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/programs/${id}`)
  revalidatePath('/admin/programs')
  redirect(`/admin/programs/${id}`)
}
