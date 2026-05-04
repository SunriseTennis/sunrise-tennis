'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { checkRateLimitAsync } from '@/lib/utils/rate-limit'
import {
  validateFormData,
  wizardAddPlayerSchema,
  wizardContactSchema,
  wizardTermsAckSchema,
} from '@/lib/utils/validation'

// ── Shared auth helper ──────────────────────────────────────────────────

async function getOnboardingAuth(): Promise<{ userId: string; familyId: string; signupSource: 'admin_invite' | 'self_signup' | 'legacy_import' }> {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: family } = await (supabase as any)
    .from('families')
    .select('signup_source')
    .eq('id', userRole.family_id)
    .single()

  return {
    userId: user.id,
    familyId: userRole.family_id,
    signupSource: (family?.signup_source ?? 'admin_invite') as 'admin_invite' | 'self_signup' | 'legacy_import',
  }
}

// ── Validation schemas (legacy admin-invite path) ───────────────────────

// Plan 17 follow-up — admin-invite contact step also splits to first + last
// so the wizard UI is consistent across both paths. Surname doesn't change
// family_name in admin-invite path (admin already named the family); we
// just store the split for downstream consumers.
const adminInviteContactSchema = z.object({
  contact_first_name: z.string().trim().min(1, 'First name is required').max(250),
  contact_last_name: z.string().trim().min(1, 'Last name is required').max(250),
  contact_phone: z.string().trim().max(50).optional().or(z.literal('')),
})

const adminInvitePlayerSchema = z.object({
  player_id: z.string().uuid('Invalid player ID'),
  first_name: z.string().trim().min(1, 'First name is required').max(200),
  dob: z.string().trim().max(20).optional().or(z.literal('')),
})

// ── Step 1: Update contact details ─────────────────────────────────────
//
// Branches on signup_source: self-signup wizard captures address (3 fields),
// admin-invite wizard sticks to name + phone (2 fields, byte-identical to today).
// Both paths advance to step 2.

export async function updateOnboardingContact(formData: FormData) {
  const { userId, familyId, signupSource } = await getOnboardingAuth()
  const supabase = await createClient()

  if (!await checkRateLimitAsync(`onboarding-contact:${userId}`, 10, 60_000)) {
    redirect('/parent/onboarding?step=1&error=Too+many+requests.+Please+wait.')
  }

  if (signupSource === 'self_signup') {
    const parsed = validateFormData(formData, wizardContactSchema)
    if (!parsed.success) {
      redirect(`/parent/onboarding?step=1&error=${encodeURIComponent(parsed.error)}`)
    }

    const { contact_first_name, contact_last_name, contact_phone, address } = parsed.data
    const fullName = `${contact_first_name} ${contact_last_name}`.trim()

    const { data: family } = await supabase
      .from('families')
      .select('primary_contact')
      .eq('id', familyId)
      .single()
    const existing = (family?.primary_contact ?? {}) as Record<string, string>

    const primaryContact = {
      ...existing,
      name: fullName,
      first_name: contact_first_name,
      last_name: contact_last_name,
      phone: contact_phone || existing.phone || undefined,
    }

    const { error } = await supabase
      .from('families')
      .update({
        primary_contact: primaryContact,
        family_name: contact_last_name,
        ...(address ? { address } : {}),
      })
      .eq('id', familyId)

    if (error) {
      console.error('[onboarding] updateOnboardingContact (self):', error)
      redirect('/parent/onboarding?step=1&error=Failed+to+save.+Please+try+again.')
    }
  } else {
    const parsed = validateFormData(formData, adminInviteContactSchema)
    if (!parsed.success) {
      redirect(`/parent/onboarding?step=1&error=${encodeURIComponent(parsed.error)}`)
    }

    const { contact_first_name, contact_last_name, contact_phone } = parsed.data
    const fullName = `${contact_first_name} ${contact_last_name}`.trim()

    const { data: family } = await supabase
      .from('families')
      .select('primary_contact')
      .eq('id', familyId)
      .single()
    const existing = (family?.primary_contact ?? {}) as Record<string, string>

    const primaryContact = {
      ...existing,
      name: fullName,
      first_name: contact_first_name,
      last_name: contact_last_name,
      phone: contact_phone || existing.phone || undefined,
    }

    // Admin-invite path: don't overwrite the admin-set family_name
    // (admin already chose it when creating the invitation).
    const { error } = await supabase
      .from('families')
      .update({ primary_contact: primaryContact })
      .eq('id', familyId)

    if (error) {
      console.error('[onboarding] updateOnboardingContact (invite):', error)
      redirect('/parent/onboarding?step=1&error=Failed+to+save.+Please+try+again.')
    }
  }

  revalidatePath('/parent/onboarding')
  redirect('/parent/onboarding?step=2')
}

// ── Step 2: Update player details ──────────────────────────────────────
//
// Admin-invite branch: bulk-update name + DOB on existing pre-created players
// (the migration cohort path). Self-signup branch: this action isn't called
// — self_signup uses addOnboardingPlayer / removeOnboardingPlayer instead.

export async function updateOnboardingPlayers(formData: FormData) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  if (!await checkRateLimitAsync(`onboarding-players:${userId}`, 10, 60_000)) {
    redirect('/parent/onboarding?step=2&error=Too+many+requests.+Please+wait.')
  }

  const playerIds: string[] = []
  formData.forEach((_, key) => {
    const match = key.match(/^player_id_(.+)$/)
    if (match) playerIds.push(match[1])
  })

  for (const playerId of playerIds) {
    const parsed = validateFormData(
      (() => {
        const slice = new FormData()
        slice.append('player_id', playerId)
        slice.append('first_name', formData.get(`first_name_${playerId}`) as string ?? '')
        slice.append('dob', formData.get(`dob_${playerId}`) as string ?? '')
        return slice
      })(),
      adminInvitePlayerSchema,
    )

    if (!parsed.success) {
      redirect(`/parent/onboarding?step=2&error=${encodeURIComponent(parsed.error)}`)
    }

    const { player_id, first_name, dob } = parsed.data

    const { data: owned } = await supabase
      .from('players')
      .select('id')
      .eq('id', player_id)
      .eq('family_id', familyId)
      .single()

    if (!owned) continue

    const { error } = await supabase
      .from('players')
      .update({
        first_name: first_name,
        dob: dob || null,
      })
      .eq('id', player_id)

    if (error) {
      console.error(`[onboarding] updateOnboardingPlayers player ${player_id}:`, error)
      redirect('/parent/onboarding?step=2&error=Failed+to+save.+Please+try+again.')
    }
  }

  revalidatePath('/parent/onboarding')
  redirect('/parent/onboarding?step=3')
}

// ── Self-signup: Add a player from wizard step 2 ─────────────────────────

export async function addOnboardingPlayer(formData: FormData) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  if (!await checkRateLimitAsync(`onboarding-add-player:${userId}`, 10, 60_000)) {
    redirect('/parent/onboarding?step=2&error=Too+many+requests.+Please+wait.')
  }

  // Wizard sentinel for "I'm not sure" — keeps the HTML5 `required` select
  // happy without polluting the shared ballColorSchema enum.
  if (formData.get('ball_color') === 'unsure') formData.set('ball_color', '')

  const parsed = validateFormData(formData, wizardAddPlayerSchema)
  if (!parsed.success) {
    redirect(`/parent/onboarding?step=2&error=${encodeURIComponent(parsed.error)}`)
  }

  const {
    first_name,
    last_name,
    preferred_name,
    dob,
    gender,
    ball_color,
    classifications,
    medical_notes,
    physical_notes,
    school,
  } = parsed.data

  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
  const parsedClassifications = classifications
    ? classifications.split(',').map((s) => s.trim()).filter((s) => VALID_CLASSES.has(s))
    : []

  // Plan 17 Block A — three granular consent toggles default to false
  // (opt-in). Wizard step 4 is where the parent grants per-player consent.
  const { error } = await supabase
    .from('players')
    .insert({
      family_id: familyId,
      first_name,
      last_name,
      preferred_name: preferred_name || null,
      dob: dob || null,
      gender: gender || null,
      ball_color: ball_color || null,
      level: ball_color || null,
      classifications: parsedClassifications,
      track: 'participation',
      medical_notes: medical_notes || null,
      physical_notes: physical_notes || null,
      school: school || null,
      media_consent_coaching: false,
      media_consent_family: false,
      media_consent_social: false,
      status: 'active',
    })

  if (error) {
    console.error('[onboarding] addOnboardingPlayer:', error)
    redirect(`/parent/onboarding?step=2&error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/parent/onboarding')
  redirect('/parent/onboarding?step=3')
}

// ── Self-signup: Remove a player added during the wizard ────────────────
//
// Restricted to families that haven't completed onboarding yet — once the
// family is in pending_review or approved, players can only be archived,
// not deleted (privacy + audit rule).

export async function removeOnboardingPlayer(playerId: string) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  if (!await checkRateLimitAsync(`onboarding-remove-player:${userId}`, 10, 60_000)) {
    redirect('/parent/onboarding?step=3&error=Too+many+requests.+Please+wait.')
  }

  const { data: family } = await supabase
    .from('families')
    .select('completed_onboarding')
    .eq('id', familyId)
    .single()
  if (family?.completed_onboarding) {
    redirect('/parent/onboarding?step=3&error=Cannot+remove+after+onboarding+complete')
  }

  const { data: owned } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('family_id', familyId)
    .single()
  if (!owned) {
    redirect('/parent/onboarding?step=3&error=Player+not+found')
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId)
  if (error) {
    console.error('[onboarding] removeOnboardingPlayer:', error)
    redirect(`/parent/onboarding?step=3&error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/parent/onboarding')
  redirect('/parent/onboarding?step=3')
}

// ── Self-signup: Acknowledge T&C + per-player media consent (step 4) ────

export async function acknowledgeOnboardingTerms(formData: FormData) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  if (!await checkRateLimitAsync(`onboarding-terms:${userId}`, 10, 60_000)) {
    redirect('/parent/onboarding?step=4&error=Too+many+requests.+Please+wait.')
  }

  const parsed = validateFormData(formData, wizardTermsAckSchema)
  if (!parsed.success) {
    redirect(`/parent/onboarding?step=4&error=${encodeURIComponent(parsed.error)}`)
  }

  // Plan 17 Block A — per-player media consent with three granular toggles.
  // Keys look like `media_consent_<kind>_<playerId>` where kind is one of
  // coaching, family, social.
  const consentByPlayerId = new Map<string, { coaching: boolean; family: boolean; social: boolean }>()
  formData.forEach((value, key) => {
    const match = key.match(/^media_consent_(coaching|family|social)_(.+)$/)
    if (match) {
      const [, kind, playerId] = match
      const existing = consentByPlayerId.get(playerId) ?? { coaching: false, family: false, social: false }
      existing[kind as 'coaching' | 'family' | 'social'] = value === 'on'
      consentByPlayerId.set(playerId, existing)
    }
  })

  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('family_id', familyId)

  for (const player of players ?? []) {
    const c = consentByPlayerId.get(player.id) ?? { coaching: false, family: false, social: false }
    const { error } = await supabase
      .from('players')
      .update({
        media_consent_coaching: c.coaching,
        media_consent_family: c.family,
        media_consent_social: c.social,
      })
      .eq('id', player.id)
    if (error) {
      console.error(`[onboarding] media_consent player ${player.id}:`, error)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: famErr } = await (supabase as any)
    .from('families')
    .update({ terms_acknowledged_at: new Date().toISOString() })
    .eq('id', familyId)
  if (famErr) {
    console.error('[onboarding] terms ack:', famErr)
    redirect('/parent/onboarding?step=4&error=Failed+to+save.+Please+try+again.')
  }

  revalidatePath('/parent/onboarding')
  redirect('/parent/onboarding?step=5')
}

// ── Step 5 (A2HS) advance — no DB write, just navigation ────────────────

export async function advancePastA2HS() {
  await getOnboardingAuth()
  redirect('/parent/onboarding?step=6')
}

// ── Final step: Complete onboarding (both flows) ────────────────────────
//
// Self-signup: fires parent.signup.submitted to admins so the family hits
// /admin/approvals immediately. Admin-invite: skips the dispatch — the family
// is already approved at invite time.

export async function completeOnboarding(pushSubscription: string | null) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  if (!await checkRateLimitAsync(`onboarding-complete:${userId}`, 5, 60_000)) {
    redirect('/parent/onboarding?error=Too+many+requests.')
  }

  if (pushSubscription) {
    try {
      const parsed = JSON.parse(pushSubscription) as { endpoint?: string }
      if (parsed.endpoint) {
        await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/push/subscribe`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: pushSubscription,
          },
        )
      }
    } catch {
      // Non-fatal — push subscription is optional.
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: familyBefore } = await (supabase as any)
    .from('families')
    .select('signup_source, family_name, primary_contact, terms_acknowledged_at')
    .eq('id', familyId)
    .single()
  const { count: playerCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', familyId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('families')
    .update({
      completed_onboarding: true,
      // Backfill terms_acknowledged_at for legacy paths that didn't go through step 4.
      ...(familyBefore?.terms_acknowledged_at ? {} : { terms_acknowledged_at: new Date().toISOString() }),
    })
    .eq('id', familyId)

  if (error) {
    console.error('[onboarding] completeOnboarding:', error)
    redirect('/parent/onboarding?error=Failed+to+complete.+Please+try+again.')
  }

  if (familyBefore?.signup_source === 'self_signup') {
    try {
      const { dispatchNotification } = await import('@/lib/notifications/dispatch')
      const contact = (familyBefore.primary_contact ?? {}) as { name?: string }
      await dispatchNotification('parent.signup.submitted', {
        familyId,
        familyName: familyBefore.family_name ?? 'A new family',
        parentName: contact.name ?? 'a parent',
        playerCount: String(playerCount ?? 0),
        excludeUserId: userId,
      })
    } catch (e) { console.error('[onboarding] dispatch:', e) }
  }

  revalidatePath('/parent')
  redirect('/parent')
}
