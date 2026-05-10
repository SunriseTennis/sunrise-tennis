'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, createServiceClient, getSessionUser } from '@/lib/supabase/server'
import { checkRateLimitAsync } from '@/lib/utils/rate-limit'
import {
  validateFormData,
  wizardAddPlayerSchema,
  wizardContactSchema,
  wizardEditPlayerSchema,
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

  // Mirror the parent's name into auth.users.raw_user_meta_data so the
  // /admin/activity directory + Supabase dashboard show the real name.
  // Plan-20 admin-invite signup (signupViaInvite) skips Supabase's
  // confirmation email and never writes name fields into user_metadata,
  // so the metadata column is empty until this step. Idempotent — same
  // payload on re-submission is a no-op.
  const formFirst = (formData.get('contact_first_name') as string | null)?.trim() ?? ''
  const formLast = (formData.get('contact_last_name') as string | null)?.trim() ?? ''
  const formFull = `${formFirst} ${formLast}`.trim()
  if (formFull) {
    const service = createServiceClient()
    const { data: existingUser } = await service.auth.admin.getUserById(userId)
    const existingMeta = (existingUser?.user?.user_metadata ?? {}) as Record<string, unknown>
    const { error: metaErr } = await service.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...existingMeta,
        first_name: formFirst,
        last_name: formLast,
        full_name: formFull,
      },
    })
    if (metaErr) {
      // Non-fatal — primary_contact is the source of truth; the directory
      // RPC falls back to it. Log and continue so a transient auth-admin
      // hiccup doesn't trap the parent in the wizard.
      console.error('[onboarding] updateUserById metadata sync:', metaErr)
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
  const { userId, familyId, signupSource } = await getOnboardingAuth()
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
    medical_notes,
    school,
  } = parsed.data

  // Plan 19 — wizard surface no longer asks for classifications. Auto-fill
  // a single-element classification array from the parent's best-guess
  // ball-colour; admin confirms via the parent.player.added notification
  // on creation. "I'm not sure" → empty array.
  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow'])
  const parsedClassifications = ball_color && VALID_CLASSES.has(ball_color) ? [ball_color] : []

  // Plan 20 — two granular consent toggles default to false (opt-in).
  // Wizard step 3 (admin-invite) / step 4 (self-signup) is where the
  // parent grants per-player consent.
  const { data: insertedPlayer, error } = await supabase
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
      school: school || null,
      media_consent_coaching: false,
      media_consent_social: false,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !insertedPlayer) {
    console.error('[onboarding] addOnboardingPlayer:', error)
    redirect(`/parent/onboarding?step=2&error=${encodeURIComponent(error?.message ?? 'Failed to add player')}`)
  }

  // Plan 19 Phase 8 — admin gets pinged so they can confirm the
  // parent's best-guess ball-colour + assign classifications. Mirrors
  // the dispatch from createPlayerFromParent (/parent/players/new).
  try {
    const { dispatchNotification } = await import('@/lib/notifications/dispatch')
    const { data: family } = await supabase
      .from('families')
      .select('family_name')
      .eq('id', familyId)
      .single()
    await dispatchNotification('parent.player.added', {
      familyId,
      familyName: family?.family_name ?? 'A family',
      playerName: `${first_name} ${last_name}`,
      ballColorSuffix: ball_color ? ` (${ball_color})` : '',
      excludeUserId: userId,
    })
  } catch (e) {
    console.error('[onboarding] addOnboardingPlayer dispatch:', e)
  }

  revalidatePath('/parent/onboarding')
  // Plan 20 — admin-invite path stays on step 2 so the parent can add
  // multiple players without ping-ponging through the wizard. Self-signup
  // keeps the original step=3 (the dedicated summary page in that flow).
  const next = signupSource === 'self_signup' ? 3 : 2
  redirect(`/parent/onboarding?step=${next}`)
}

// ── Plan 20 — Wizard step 2 inline edit for pre-existing players ────────
//
// Lets admin-invite parents edit player info inline (name/dob/gender/
// preferred/school/medical) without leaving the wizard. Ball-level is
// admin's call for pre-existing players, so it's NOT in the form — the
// parent edits it later via /parent/players/[id] if needed.
//
// Allowed for both admin-invite and self-signup paths so a typo at
// add-time can be fixed before the rest of the flow.

export async function editOnboardingPlayer(formData: FormData) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  if (!await checkRateLimitAsync(`onboarding-edit-player:${userId}`, 20, 60_000)) {
    redirect('/parent/onboarding?step=2&error=Too+many+requests.+Please+wait.')
  }

  const parsed = validateFormData(formData, wizardEditPlayerSchema)
  if (!parsed.success) {
    redirect(`/parent/onboarding?step=2&error=${encodeURIComponent(parsed.error)}`)
  }

  const { player_id, first_name, last_name, preferred_name, dob, gender, school } = parsed.data

  // Ownership check — RLS would filter, but fail loud if the parent
  // is poking at a player they don't own.
  const { data: owned } = await supabase
    .from('players')
    .select('id')
    .eq('id', player_id)
    .eq('family_id', familyId)
    .single()
  if (!owned) {
    redirect('/parent/onboarding?step=2&error=Player+not+found')
  }

  const { error } = await supabase
    .from('players')
    .update({
      first_name,
      last_name,
      preferred_name: preferred_name || null,
      dob: dob || null,
      gender: gender || null,
      school: school || null,
    })
    .eq('id', player_id)

  if (error) {
    console.error('[onboarding] editOnboardingPlayer:', error)
    redirect('/parent/onboarding?step=2&error=Failed+to+save.+Please+try+again.')
  }

  revalidatePath('/parent/onboarding')
  redirect('/parent/onboarding?step=2')
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
  const { userId, familyId, signupSource } = await getOnboardingAuth()
  const supabase = await createClient()

  if (!await checkRateLimitAsync(`onboarding-terms:${userId}`, 10, 60_000)) {
    redirect('/parent/onboarding?step=4&error=Too+many+requests.+Please+wait.')
  }

  const parsed = validateFormData(formData, wizardTermsAckSchema)
  if (!parsed.success) {
    redirect(`/parent/onboarding?step=4&error=${encodeURIComponent(parsed.error)}`)
  }

  // Plan 20 — per-player media consent with two granular toggles
  // (coaching + social). family was dropped 05-May-2026.
  // Keys look like `media_consent_<kind>_<playerId>`.
  const consentByPlayerId = new Map<string, { coaching: boolean; social: boolean }>()
  formData.forEach((value, key) => {
    const match = key.match(/^media_consent_(coaching|social)_(.+)$/)
    if (match) {
      const [, kind, playerId] = match
      const existing = consentByPlayerId.get(playerId) ?? { coaching: false, social: false }
      existing[kind as 'coaching' | 'social'] = value === 'on'
      consentByPlayerId.set(playerId, existing)
    }
  })

  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('family_id', familyId)

  for (const player of players ?? []) {
    const c = consentByPlayerId.get(player.id) ?? { coaching: false, social: false }
    const { error } = await supabase
      .from('players')
      .update({
        media_consent_coaching: c.coaching,
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
  // Plan 20 follow-up — A2HS lives at step 4 in admin-invite (5 steps)
  // and step 5 in self-signup (6 steps). Hard-coding step=5 worked for
  // self-signup but skipped A2HS in admin-invite. Branch explicitly.
  const next = signupSource === 'self_signup' ? 5 : 4
  redirect(`/parent/onboarding?step=${next}`)
}

// ── A2HS advance — no DB write, just navigation ─────────────────────────
//
// Plan 20 — read signup_source and redirect explicitly so a future drift
// in step counts (admin-invite=5, self-signup=6) can't silently re-render
// the same A2HS step (the trap we hit when ADMIN_INVITE_TOTAL_STEPS lagged
// behind the actual rendered count post-Plan-19).

export async function advancePastA2HS() {
  const { signupSource } = await getOnboardingAuth()
  const next = signupSource === 'self_signup' ? 6 : 5
  redirect(`/parent/onboarding?step=${next}`)
}

// ── Final step: Complete onboarding (both flows) ────────────────────────
//
// Self-signup: fires parent.signup.submitted to admins so the family hits
// /admin/approvals immediately. Admin-invite (Plan 19): also fires
// family.approval.granted so the welcome banner lights up on /parent and
// the welcome email goes out. The admin-invite path doesn't go through
// /admin/approvals — we mark approved_at = now() at completeOnboarding
// time so the JustApprovedBanner trigger has a real timestamp.
//
// Plan 19 — `termsAccepted` arg removed. T&C is now acked on its own
// dedicated step (3 for admin-invite, 4 for self-signup) via
// `acknowledgeOnboardingTerms`, which sets `terms_acknowledged_at`
// before the parent ever reaches the final step.

export async function completeOnboarding(
  pushSubscription: string | null,
) {
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
    .select('signup_source, family_name, primary_contact, terms_acknowledged_at, approved_at')
    .eq('id', familyId)
    .single()
  const { count: playerCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', familyId)

  // Plan 19 — for admin-invite (and legacy_import) paths, stamp approved_at
  // at completion so the JustApprovedBanner lights up on /parent. The family
  // is already in approval_status='approved' from creation; we just need a
  // recent timestamp for the 14-day banner window.
  const isAdminInvite = (familyBefore?.signup_source ?? 'admin_invite') !== 'self_signup'
  const stampApprovedAt = isAdminInvite && !familyBefore?.approved_at

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('families')
    .update({
      completed_onboarding: true,
      // Backfill terms_acknowledged_at for legacy paths that didn't go through the consent step.
      ...(familyBefore?.terms_acknowledged_at ? {} : { terms_acknowledged_at: new Date().toISOString() }),
      ...(stampApprovedAt ? { approved_at: new Date().toISOString() } : {}),
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
  } else if (isAdminInvite) {
    // Plan 19 Phase 9 — fire the same welcome event self-signup-approved
    // families get, so the banner + welcome email also reach admin-invite
    // parents at the moment they finish onboarding. Skip if the family
    // already had an approved_at (re-completing is rare and shouldn't
    // re-fire the welcome).
    if (stampApprovedAt) {
      try {
        const { dispatchNotification } = await import('@/lib/notifications/dispatch')
        await dispatchNotification('family.approval.granted', {
          familyId,
          familyName: familyBefore?.family_name ?? 'your family',
          adminNote: '',
          excludeUserId: undefined,
        })
      } catch (e) { console.error('[onboarding] welcome dispatch:', e) }
    }
  }

  revalidatePath('/parent')
  redirect('/parent')
}
