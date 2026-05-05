'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { validateFormData, updateContactFormSchema, updatePlayerDetailsFormSchema, parentCreatePlayerFormSchema } from '@/lib/utils/validation'
import { dispatchNotification } from '@/lib/notifications/dispatch'

async function getParentFamilyId(): Promise<string | null> {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) return null

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  return userRole?.family_id ?? null
}

/**
 * Plan 15 Phase B — when a parent edits anything while their family is in
 * `changes_requested` state, flip back to `pending_review` so the admin
 * sees it bubble up the queue. Idempotent (RPC only flips the matching state).
 */
async function maybeResubmitForReview(familyId: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc('resubmit_family_for_review', { p_family_id: familyId })
  } catch {
    // Non-fatal — edits still saved either way.
  }
}

export async function updateContactInfo(formData: FormData) {
  const supabase = await createClient()
  const familyId = await getParentFamilyId()
  if (!familyId) redirect('/login')

  const parsed = validateFormData(formData, updateContactFormSchema)
  if (!parsed.success) {
    redirect(`/parent/settings?error=${encodeURIComponent(parsed.error)}`)
  }

  const {
    contact_first_name: contactFirstName,
    contact_last_name: contactLastName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    address,
    secondary_first_name: secondaryFirstName,
    secondary_last_name: secondaryLastName,
    secondary_phone: secondaryPhone,
    secondary_email: secondaryEmail,
  } = parsed.data

  // Plan 17 follow-up — surname is the family name; full "First Last"
  // is the primary_contact display name. Both are kept in sync here.
  const fullName = `${contactFirstName} ${contactLastName}`.trim()
  const primaryContact = {
    name: fullName,
    first_name: contactFirstName,
    last_name: contactLastName,
    phone: contactPhone || undefined,
    email: contactEmail || undefined,
  }

  const secondaryFull = `${secondaryFirstName ?? ''} ${secondaryLastName ?? ''}`.trim()
  const secondaryContact = secondaryFull ? {
    name: secondaryFull,
    first_name: secondaryFirstName || undefined,
    last_name: secondaryLastName || undefined,
    phone: secondaryPhone || undefined,
    email: secondaryEmail || undefined,
  } : null

  const { error } = await supabase
    .from('families')
    .update({
      primary_contact: primaryContact,
      secondary_contact: secondaryContact,
      family_name: contactLastName,
      address: address || null,
    })
    .eq('id', familyId)

  if (error) {
    redirect(`/parent/settings?error=${encodeURIComponent(error.message)}`)
  }

  await maybeResubmitForReview(familyId)
  revalidatePath('/parent/settings')
  revalidatePath('/parent')
  redirect('/parent/settings?success=Contact+info+updated')
}

export async function updateMediaConsent(playerId: string, formData: FormData) {
  const supabase = await createClient()
  const familyId = await getParentFamilyId()
  if (!familyId) redirect('/login')

  // Verify parent owns this player
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('family_id', familyId)
    .single()

  if (!player) redirect('/parent/settings')

  // Plan 20 — two granular consent toggles, parsed directly.
  const coaching = formData.get('media_consent_coaching') === 'on'
  const social = formData.get('media_consent_social') === 'on'

  const { error } = await supabase
    .from('players')
    .update({
      media_consent_coaching: coaching,
      media_consent_social: social,
    })
    .eq('id', playerId)

  if (error) {
    redirect(`/parent/settings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/parent/settings')
  redirect('/parent/settings?success=Media+consent+updated')
}

export async function updatePlayerDetails(playerId: string, formData: FormData) {
  const supabase = await createClient()
  const familyId = await getParentFamilyId()
  if (!familyId) redirect('/login')

  // Verify parent owns this player
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('family_id', familyId)
    .single()

  if (!player) redirect('/parent')

  const parsed = validateFormData(formData, updatePlayerDetailsFormSchema)
  if (!parsed.success) {
    redirect(`/parent/players/${playerId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { first_name: firstName, last_name: lastName, dob, gender, medical_notes: medicalNotes, school } = parsed.data

  // Plan 20 — two granular consent toggles.
  const coaching = formData.get('media_consent_coaching') === 'on'
  const social = formData.get('media_consent_social') === 'on'

  const { error } = await supabase
    .from('players')
    .update({
      first_name: firstName,
      last_name: lastName,
      dob: dob || null,
      gender: gender || null,
      medical_notes: medicalNotes || null,
      school: school || null,
      media_consent_coaching: coaching,
      media_consent_social: social,
    })
    .eq('id', playerId)

  if (error) {
    redirect(`/parent/players/${playerId}?error=${encodeURIComponent(error.message)}`)
  }

  await maybeResubmitForReview(familyId)
  revalidatePath(`/parent/players/${playerId}`)
  revalidatePath('/parent')
  redirect(`/parent/players/${playerId}?success=Player+details+updated`)
}

export async function generateCalendarToken() {
  const supabase = await createClient()
  const familyId = await getParentFamilyId()
  if (!familyId) redirect('/login')

  const token = randomUUID()

  const { error: updateError } = await supabase
    .from('families')
    .update({ calendar_token: token })
    .eq('id', familyId)

  if (updateError) {
    redirect(`/parent/settings?error=${encodeURIComponent(updateError.message)}`)
  }

  revalidatePath('/parent/settings')
  redirect('/parent/settings?success=Calendar+link+generated')
}

export async function revokeCalendarToken() {
  const supabase = await createClient()
  const familyId = await getParentFamilyId()
  if (!familyId) redirect('/login')

  const { error } = await supabase
    .from('families')
    .update({ calendar_token: null })
    .eq('id', familyId)

  if (error) {
    redirect(`/parent/settings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/parent/settings')
  redirect('/parent/settings?success=Calendar+link+revoked')
}

export async function createPlayerFromParent(formData: FormData) {
  const supabase = await createClient()
  const familyId = await getParentFamilyId()
  if (!familyId) redirect('/login')

  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!await checkRateLimitAsync(`add-player:${user.id}`, 3, 60_000)) {
    redirect('/parent/players/new?error=Too+many+requests.+Please+wait.')
  }

  const parsed = validateFormData(formData, parentCreatePlayerFormSchema)
  if (!parsed.success) {
    redirect(`/parent/players/new?error=${encodeURIComponent(parsed.error)}`)
  }

  const {
    first_name: firstName,
    last_name: lastName,
    preferred_name: preferredName,
    dob,
    gender,
    ball_color: ballColor,
    medical_notes: medicalNotes,
    school,
  } = parsed.data

  // Plan 20 — two granular consent toggles parsed from FormData.
  const coaching = formData.get('media_consent_coaching') === 'on'
  const social = formData.get('media_consent_social') === 'on'

  // Plan 19 — parent surface no longer asks for classifications/track.
  // Auto-fill classifications from ball_color (single-element array, or
  // empty when "I'm not sure"). Admin confirms via the parent.player.added
  // notification on creation.
  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow'])
  const parsedClassifications = ballColor && VALID_CLASSES.has(ballColor) ? [ballColor] : []

  const { data: created, error } = await supabase
    .from('players')
    .insert({
      family_id: familyId,
      first_name: firstName,
      last_name: lastName,
      preferred_name: preferredName || null,
      dob: dob || null,
      gender: gender || null,
      ball_color: ballColor || null,
      level: ballColor || null,
      classifications: parsedClassifications,
      track: 'participation',
      medical_notes: medicalNotes || null,
      school: school || null,
      media_consent_coaching: coaching,
      media_consent_social: social,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !created) {
    redirect(`/parent/players/new?error=${encodeURIComponent(error?.message ?? 'Failed to add player')}`)
  }

  // Notify admins via dispatcher (parent.player.added).
  try {
    const { data: family } = await supabase
      .from('families')
      .select('family_name')
      .eq('id', familyId)
      .single()
    await dispatchNotification('parent.player.added', {
      familyName: family?.family_name ?? 'A family',
      playerName: `${firstName} ${lastName}`,
      ballColorSuffix: ballColor ? ` (${ballColor})` : '',
      excludeUserId: user.id,
    })
  } catch { /* non-blocking */ }

  await maybeResubmitForReview(familyId)
  revalidatePath('/parent')
  revalidatePath('/parent/programs')
  revalidatePath('/parent/players')
  redirect(`/parent/players/${created.id}?success=Player+added.+Admin+will+confirm+ball+level+shortly.`)
}

/**
 * Plan 17 Block D — parent dismisses the "You're approved!" welcome
 * banner. Stamps families.welcome_banner_dismissed_at so the page-level
 * gate hides it on subsequent visits. Fire-and-forget from the client.
 */
export async function dismissJustApprovedBanner(familyId: string) {
  const supabase = await createClient()
  const ownFamilyId = await getParentFamilyId()
  if (!ownFamilyId || ownFamilyId !== familyId) return

  await supabase
    .from('families')
    .update({ welcome_banner_dismissed_at: new Date().toISOString() })
    .eq('id', familyId)

  revalidatePath('/parent')
}

export async function updateNotificationPreferences(formData: FormData) {
  const supabase = await createClient()
  const familyId = await getParentFamilyId()
  if (!familyId) redirect('/login')

  const sessionReminders = formData.get('session_reminders') as string
  const validOptions = ['all', 'first_week_and_privates', 'privates_only', 'off']
  if (!validOptions.includes(sessionReminders)) {
    redirect('/parent/settings?error=Invalid+preference')
  }

  const preChargeHeadsUp = formData.get('pre_charge_heads_up') === 'on'

  // Preserve any other keys in notification_preferences
  const { data: existing } = await supabase
    .from('families')
    .select('notification_preferences')
    .eq('id', familyId)
    .single()
  const current = (existing?.notification_preferences as Record<string, unknown> | null) ?? {}

  const { error } = await supabase
    .from('families')
    .update({
      notification_preferences: {
        ...current,
        session_reminders: sessionReminders,
        pre_charge_heads_up: preChargeHeadsUp,
      },
    })
    .eq('id', familyId)

  if (error) {
    redirect(`/parent/settings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/parent/settings')
  redirect('/parent/settings?success=Notification+preferences+updated')
}
