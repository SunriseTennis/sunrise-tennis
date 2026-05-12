'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser, requireAdmin } from '@/lib/supabase/server'
import {
  validateFormData,
  createFamilyFormSchema,
  updateFamilyFormSchema,
  createPlayerFormSchema,
  updatePlayerFormSchema,
  createProgramFormSchema,
  updateProgramFormSchema,
  createSessionFormSchema,
  createInvitationFormSchema,
  attendanceStatusSchema,
  generateTermSessionsFormSchema,
} from '@/lib/utils/validation'
import {
  createCharge,
  voidCharge,
  getExistingSessionCharge,
  recalculateBalance,
  formatChargeDescription,
} from '@/lib/utils/billing'
import { getPlayerSessionPriceBreakdown, getPlayerEffectiveSessionPriceBreakdown, formatDiscountSuffix, buildPricingBreakdown } from '@/lib/utils/player-pricing'
import { getTermLabel } from '@/lib/utils/school-terms'
import { getActiveEarlyBird } from '@/lib/utils/eligibility'
// Adelaide-aware future-session filtering is now centralised inside
// `gatherTermEnrolSessions` for every term-enrol path on this page.
import { formatDate, formatTime } from '@/lib/utils/dates'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { createTermSessionCharges, gatherTermEnrolSessions, voidAbsorbableCharges } from '@/lib/utils/term-charges'

// ── Cancellation helpers ────────────────────────────────────────────────

export type CancellationCategory = 'rain_out' | 'heat_out' | 'other'

const CANCELLATION_CATEGORIES: readonly CancellationCategory[] = ['rain_out', 'heat_out', 'other']

function isCancellationCategory(v: unknown): v is CancellationCategory {
  return typeof v === 'string' && (CANCELLATION_CATEGORIES as readonly string[]).includes(v)
}

/** Human-friendly label rendered in the notification body via {reasonLabel}. */
function cancellationReasonLabel(category: CancellationCategory, reason: string | null): string {
  if (category === 'rain_out') return 'rain'
  if (category === 'heat_out') return 'extreme heat'
  const trimmed = (reason ?? '').trim()
  return trimmed.length > 0 ? trimmed : 'an unexpected reason'
}

/** Server-side parse + normalise of cancellation FormData fields. */
function parseCancellationFormData(formData: FormData): { category: CancellationCategory; reason: string | null } | { error: string } {
  const rawCategory = formData.get('cancellation_category')
  if (!isCancellationCategory(rawCategory)) {
    return { error: 'Cancellation reason is required (rain_out, heat_out, other).' }
  }
  const rawReason = (formData.get('cancellation_reason') as string | null) ?? (formData.get('reason') as string | null) ?? null
  const reason = rawReason ? rawReason.trim() : null
  if (rawCategory === 'other' && (!reason || reason.length === 0)) {
    return { error: 'A reason is required when cancellation type is Other.' }
  }
  // Persist a human-readable reason string alongside the category. For
  // rain_out / heat_out without a custom note, default to a sensible label.
  const persistReason =
    rawCategory === 'other'
      ? reason!
      : reason && reason.length > 0
        ? reason
        : rawCategory === 'rain_out'
          ? 'Rained out'
          : 'Heat cancelled'
  return { category: rawCategory, reason: persistReason }
}

/**
 * Cancel a single session and apply per-family financial side-effects + notify
 * each affected family via the rule-driven dispatcher.
 *
 * Shared by `cancelSession` (admin clicks Cancel on one session) and
 * `cancelTodaySessions` (bulk "Cancel today's sessions" from /admin overview).
 * Caller is responsible for the redirect + revalidatePath.
 *
 * Pre-conditions: session exists; `requireAdmin()` has been called by the
 * caller; `supabase` is the JWT-scoped admin client.
 */
async function _cancelSingleSessionInternal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
  opts: { category: CancellationCategory; reason: string },
): Promise<{ error?: string; familyIdsNotified?: string[] }> {
  const { category, reason } = opts

  const { data: session } = await supabase
    .from('sessions')
    .select('id, program_id, date, start_time, session_type')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Session not found' }

  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'cancelled',
      cancellation_reason: reason,
      cancellation_category: category,
    })
    .eq('id', sessionId)

  if (error) return { error: error.message }

  // Private sessions: mask the coach slot so it doesn't auto-reappear, and
  // flip any active bookings to cancelled with type='admin'.
  if (session.session_type === 'private') {
    const { maskCoachSlotOnAdminOrCoachCancel } = await import('@/lib/private-cancel')
    await maskCoachSlotOnAdminOrCoachCancel(supabase, sessionId, reason)
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_type: 'admin' })
      .eq('session_id', sessionId)
      .neq('status', 'cancelled')
  }

  if (!session.program_id) {
    // Non-program standalone session — nothing further to credit / dispatch.
    return { familyIdsNotified: [] }
  }

  const programId = session.program_id
  const { data: program } = await supabase
    .from('programs')
    .select('name, type')
    .eq('id', programId)
    .single()

  const { data: roster } = await supabase
    .from('program_roster')
    .select('player_id')
    .eq('program_id', programId)
    .eq('status', 'enrolled')

  type FamilyImpact = { hadPayNow: boolean; hadPayLater: boolean }
  const familyImpact = new Map<string, FamilyImpact>()

  for (const rosterEntry of roster ?? []) {
    const playerId = rosterEntry.player_id

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, family_id, payment_option')
      .eq('player_id', playerId)
      .eq('program_id', programId)
      .eq('status', 'confirmed')
      .order('booked_at', { ascending: false })
      .limit(1)
      .single()

    if (!booking) continue

    const familyId = booking.family_id
    const impact = familyImpact.get(familyId) ?? { hadPayNow: false, hadPayLater: false }

    const existingCharge = await getExistingSessionCharge(supabase, sessionId, playerId)

    if (booking.payment_option === 'pay_later' && existingCharge) {
      await voidCharge(supabase, existingCharge.id, familyId)
      impact.hadPayLater = true
    } else if (booking.payment_option === 'pay_now') {
      const { priceCents: sessionPrice } = await getPlayerSessionPriceBreakdown(
        supabase, familyId, programId, program?.type, playerId,
      )
      if (!existingCharge) {
        await createCharge(supabase, {
          familyId,
          playerId,
          type: 'credit',
          sourceType: 'cancellation',
          sourceId: sessionId,
          sessionId,
          programId,
          bookingId: booking.id,
          description: formatChargeDescription({
            label: program?.name ?? 'Session',
            suffix: `Cancelled - ${reason}`,
            term: session?.date ? getTermLabel(session.date) : null,
            date: session?.date ?? null,
          }),
          amountCents: -sessionPrice,
          status: 'confirmed',
          createdBy: userId,
        })
        impact.hadPayNow = true
      }
    }

    familyImpact.set(familyId, impact)
  }

  for (const fid of familyImpact.keys()) {
    await recalculateBalance(supabase, fid)
  }

  const dateStr = session?.date ? formatDate(session.date) : ''
  const timeStr = session?.start_time ? formatTime(session.start_time) : ''
  const programName = program?.name ?? 'A session'
  const reasonLabel = cancellationReasonLabel(category, reason)

  const familyIdsNotified: string[] = []
  for (const [familyId, impact] of familyImpact) {
    const creditNote =
      impact.hadPayNow && impact.hadPayLater
        ? "We've adjusted your account accordingly."
        : impact.hadPayNow
          ? 'A credit has been added to your account.'
          : impact.hadPayLater
            ? "We've removed the upcoming charge from your account."
            : ''

    try {
      await dispatchNotification('admin.session.cancelled', {
        familyId,
        programName,
        date: dateStr,
        time: timeStr,
        creditNote,
        reasonLabel,
        category,
      })
      familyIdsNotified.push(familyId)
    } catch (e) {
      console.error('dispatch admin.session.cancelled failed for', familyId, e instanceof Error ? e.message : e)
    }
  }

  return { familyIdsNotified }
}

// ── Families ────────────────────────────────────────────────────────────

export async function createFamily(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createFamilyFormSchema)
  if (!parsed.success) {
    redirect(`/admin/families/new?error=${encodeURIComponent(parsed.error)}`)
  }

  // Generate next display_id in the C### namespace (admin-invite + lead).
  // Self-signups use S### (Plan 15 Phase D); test families have used T-prefixed
  // strings. Filtering to C% so neither namespace can collide-poison this counter.
  const { data: lastFamily } = await supabase
    .from('families')
    .select('display_id')
    .like('display_id', 'C%')
    .order('display_id', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextNum = 1
  if (lastFamily?.display_id) {
    const match = lastFamily.display_id.match(/^C(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  const displayId = `C${String(nextNum).padStart(3, '0')}`

  // Plan 17 follow-up — primary contact is split into first + last; surname
  // becomes families.family_name (no separate input on the create form).
  const {
    contact_first_name: contactFirstName,
    contact_last_name: contactLastName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    address,
    referred_by: referredBy,
  } = parsed.data

  const fullName = `${contactFirstName} ${contactLastName}`.trim()
  const primaryContact = {
    name: fullName,
    first_name: contactFirstName,
    last_name: contactLastName,
    phone: contactPhone || undefined,
    email: contactEmail || undefined,
  }

  const { data, error } = await supabase
    .from('families')
    .insert({
      display_id: displayId,
      family_name: contactLastName,
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

  // Check if referred_by matches an existing family's display_id → create referral
  if (referredBy) {
    const { data: referringFamily } = await supabase
      .from('families')
      .select('id')
      .eq('display_id', referredBy.toUpperCase().trim())
      .single()

    if (referringFamily) {
      await supabase.from('referrals').insert({
        referring_family_id: referringFamily.id,
        referred_family_id: data.id,
        status: 'pending',
        credit_amount_cents: 5000, // $50
      })
    }
  }

  revalidatePath('/admin/families')
  redirect(`/admin/families/${data.id}`)
}

export async function updateFamily(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, updateFamilyFormSchema)
  if (!parsed.success) {
    redirect(`/admin/families/${id}?error=${encodeURIComponent(parsed.error)}`)
  }

  // Plan 17 follow-up — primary + secondary contact split into first + last.
  // Primary surname becomes families.family_name; the standalone family_name
  // input is gone from the admin edit form.
  const {
    contact_first_name: contactFirstName,
    contact_last_name: contactLastName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    address,
    status,
    notes,
    secondary_first_name: secondaryFirstName,
    secondary_last_name: secondaryLastName,
    secondary_role: secondaryRole,
    secondary_phone: secondaryPhone,
    secondary_email: secondaryEmail,
  } = parsed.data

  const fullName = `${contactFirstName} ${contactLastName}`.trim()
  const primaryContact = {
    name: fullName,
    first_name: contactFirstName,
    last_name: contactLastName,
    phone: contactPhone || undefined,
    email: contactEmail || undefined,
  }

  const secondaryFull = `${secondaryFirstName ?? ''} ${secondaryLastName ?? ''}`.trim()
  const secondaryContact = (secondaryFull || secondaryPhone || secondaryEmail)
    ? {
        name: secondaryFull || undefined,
        first_name: secondaryFirstName || undefined,
        last_name: secondaryLastName || undefined,
        role: secondaryRole || undefined,
        phone: secondaryPhone || undefined,
        email: secondaryEmail || undefined,
      }
    : null

  const { error } = await supabase
    .from('families')
    .update({
      family_name: contactLastName,
      primary_contact: primaryContact,
      secondary_contact: secondaryContact,
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
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createPlayerFormSchema)
  if (!parsed.success) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const {
    first_name: firstName,
    last_name: lastName,
    dob,
    gender,
    classifications,
    track,
    medical_notes: medicalNotes,
  } = parsed.data

  // Plan 20 — two granular consent toggles parsed from FormData.
  const coaching = formData.get('media_consent_coaching') === 'on'
  const social = formData.get('media_consent_social') === 'on'

  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
  const parsedClassifications = classifications
    ? classifications.split(',').map((s) => s.trim()).filter((s) => VALID_CLASSES.has(s))
    : []

  // Plan 24 — ball_color + level retired; classifications is the only signal.
  const { error } = await supabase
    .from('players')
    .insert({
      family_id: familyId,
      first_name: firstName,
      last_name: lastName,
      dob: dob || null,
      gender: gender || null,
      classifications: parsedClassifications,
      track: track || 'participation',
      medical_notes: medicalNotes || null,
      media_consent_coaching: coaching,
      media_consent_social: social,
      status: 'active',
    })

  if (error) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}`)
}

export async function updatePlayer(playerId: string, familyId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, updatePlayerFormSchema)
  if (!parsed.success) {
    redirect(`/admin/families/${familyId}/players/${playerId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { first_name: firstName, last_name: lastName, preferred_name: preferredName, gender, dob, classifications, track, status, medical_notes: medicalNotes, current_focus: currentFocus, short_term_goal: shortTermGoal, long_term_goal: longTermGoal, comp_interest: compInterest, school } = parsed.data

  // Plan 20 — two granular consent toggles parsed from FormData.
  const coaching = formData.get('media_consent_coaching') === 'on'
  const social = formData.get('media_consent_social') === 'on'

  // Parse comma-separated classifications, filter to known values
  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
  const parsedClassifications = classifications
    ? classifications.split(',').map(s => s.trim()).filter(s => VALID_CLASSES.has(s))
    : []

  // Plan 24 — ball_color + level retired; classifications is the only signal.
  const { error } = await supabase
    .from('players')
    .update({
      first_name: firstName,
      last_name: lastName,
      preferred_name: preferredName || null,
      gender: gender || null,
      dob: dob || null,
      classifications: parsedClassifications,
      track: track || 'participation',
      status: status || 'active',
      medical_notes: medicalNotes || null,
      current_focus: currentFocus ? currentFocus.split(',').map((s) => s.trim()) : null,
      short_term_goal: shortTermGoal || null,
      long_term_goal: longTermGoal || null,
      comp_interest: compInterest || null,
      school: school || null,
      media_consent_coaching: coaching,
      media_consent_social: social,
    })
    .eq('id', playerId)

  if (error) {
    redirect(`/admin/families/${familyId}/players/${playerId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/families/${familyId}/players/${playerId}`)
  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}/players/${playerId}`)
}

// ── Status cascade helpers ─────────────────────────────────────────────
//
// When admin flips a player's status, if every non-archived sibling now
// agrees on one bucket (active / inactive / archived), the family rolls
// over to match. When admin flips a family's status, all players follow.
// 'lead' is a one-way carve-out — never cascade in either direction.
//
// Both helpers are best-effort secondaries: on RLS or transport failure
// they log and return, letting the primary write keep its success.

type AdminSupabaseClient = Awaited<ReturnType<typeof createClient>>

async function cascadeFamilyFromPlayers(
  supabase: AdminSupabaseClient,
  familyId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: players, error: playersErr } = await (supabase.from('players') as any)
    .select('status')
    .eq('family_id', familyId)

  if (playersErr) {
    console.error('[cascadeFamilyFromPlayers] read players:', playersErr.message)
    return
  }
  if (!players || players.length === 0) return // no players → leave family alone

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fam, error: famErr } = await (supabase.from('families') as any)
    .select('status')
    .eq('id', familyId)
    .single()
  if (famErr || !fam) {
    if (famErr) console.error('[cascadeFamilyFromPlayers] read family:', famErr.message)
    return
  }
  if (fam.status === 'lead') return // lead families never auto-flip

  // Archived players are "gone" — they don't block an all-active rollup.
  const live = (players as Array<{ status: string }>).filter(p => p.status !== 'archived')

  let rollup: 'active' | 'inactive' | 'archived' | null = null
  if (live.length === 0) {
    // every player is archived → family becomes archived too
    rollup = 'archived'
  } else {
    const statuses = new Set(live.map(p => p.status))
    if (statuses.size === 1) {
      const [only] = [...statuses]
      if (only === 'active' || only === 'inactive') rollup = only
    }
  }

  if (!rollup) return
  if (rollup === fam.status) return // already matches

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: writeErr } = await (supabase.from('families') as any)
    .update({ status: rollup })
    .eq('id', familyId)
  if (writeErr) {
    console.error('[cascadeFamilyFromPlayers] write family:', writeErr.message)
  }
}

async function cascadePlayersFromFamily(
  supabase: AdminSupabaseClient,
  familyId: string,
  newStatus: 'active' | 'inactive' | 'archived' | 'lead',
): Promise<void> {
  // 'lead' families don't carry the cascade — players have no 'lead' status,
  // and a family being marked a lead shouldn't bulk-deactivate real players.
  if (newStatus === 'lead') return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('players') as any)
    .update({ status: newStatus })
    .eq('family_id', familyId)
  if (error) {
    console.error('[cascadePlayersFromFamily]:', error.message)
  }
}

/**
 * Inline-edit a single player. Accepts a partial patch — only fields
 * present in the payload are written. Auths admin and filters constrained
 * fields to known values.
 *
 * Plan 24 — ball_color removed from accepted patch (column retired);
 * patch shape extended to cover every editable field on the per-family
 * player profile so click-to-edit replaces the bottom <PlayerEditForm>.
 *
 * Used by `/admin/players` table cells AND `/admin/families/[id]/players/[id]` profile.
 */
export async function updatePlayerInline(
  playerId: string,
  patch: {
    first_name?: string
    last_name?: string
    preferred_name?: string | null
    classifications?: string[]
    track?: 'performance' | 'participation'
    status?: 'active' | 'inactive' | 'archived'
    gender?: 'male' | 'female' | 'non_binary' | null
    dob?: string | null
    school?: string | null
    medical_notes?: string | null
    current_focus?: string[]
    short_term_goal?: string | null
    long_term_goal?: string | null
    comp_interest?: 'yes' | 'no' | 'future' | null
    media_consent_coaching?: boolean
    media_consent_social?: boolean
  },
): Promise<{ error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
  const VALID_GENDER = new Set(['male', 'female', 'non_binary'])
  const VALID_COMP = new Set(['yes', 'no', 'future'])

  type PlayerUpdate = Record<string, unknown>
  const update: PlayerUpdate = {}

  if (patch.first_name !== undefined) {
    const v = patch.first_name.trim()
    if (!v) return { error: 'First name is required' }
    update.first_name = v
  }
  if (patch.last_name !== undefined) {
    const v = patch.last_name.trim()
    if (!v) return { error: 'Last name is required' }
    update.last_name = v
  }
  if (patch.preferred_name !== undefined) {
    update.preferred_name = patch.preferred_name?.trim() || null
  }
  if (patch.classifications !== undefined) {
    update.classifications = patch.classifications.filter(c => VALID_CLASSES.has(c))
  }
  if (patch.track !== undefined) {
    if (patch.track !== 'performance' && patch.track !== 'participation') {
      return { error: 'Invalid track' }
    }
    update.track = patch.track
  }
  if (patch.status !== undefined) {
    if (!['active', 'inactive', 'archived'].includes(patch.status)) {
      return { error: 'Invalid status' }
    }
    update.status = patch.status
  }
  if (patch.gender !== undefined) {
    if (patch.gender !== null && !VALID_GENDER.has(patch.gender)) {
      return { error: 'Invalid gender' }
    }
    update.gender = patch.gender
  }
  if (patch.dob !== undefined) {
    update.dob = patch.dob || null
  }
  if (patch.school !== undefined) {
    update.school = patch.school?.trim() || null
  }
  if (patch.medical_notes !== undefined) {
    // Plain string write — `encrypt_medical_on_write` trigger encrypts at DB layer.
    update.medical_notes = patch.medical_notes?.trim() || null
  }
  if (patch.current_focus !== undefined) {
    update.current_focus = patch.current_focus.map(s => s.trim()).filter(Boolean)
  }
  if (patch.short_term_goal !== undefined) {
    update.short_term_goal = patch.short_term_goal?.trim() || null
  }
  if (patch.long_term_goal !== undefined) {
    update.long_term_goal = patch.long_term_goal?.trim() || null
  }
  if (patch.comp_interest !== undefined) {
    if (patch.comp_interest !== null && !VALID_COMP.has(patch.comp_interest)) {
      return { error: 'Invalid competition interest' }
    }
    update.comp_interest = patch.comp_interest
  }
  if (patch.media_consent_coaching !== undefined) {
    update.media_consent_coaching = !!patch.media_consent_coaching
  }
  if (patch.media_consent_social !== undefined) {
    update.media_consent_social = !!patch.media_consent_social
  }

  if (Object.keys(update).length === 0) return {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('players') as any).update(update).eq('id', playerId)
  if (error) {
    console.error('updatePlayerInline failed:', error.message)
    return { error: 'Update failed' }
  }

  revalidatePath('/admin/players')
  // Per-family + player detail revalidation — find the family_id so the
  // family page (player chip subtitle) also refreshes.
  const { data: row } = await supabase.from('players').select('family_id').eq('id', playerId).single()
  if (row?.family_id) {
    revalidatePath(`/admin/families/${row.family_id}`)
    revalidatePath(`/admin/families/${row.family_id}/players/${playerId}`)
    // If status changed, roll up to the family — if every non-archived
    // sibling agrees, family follows. Best-effort; logs on failure.
    if (patch.status !== undefined) {
      await cascadeFamilyFromPlayers(supabase, row.family_id as string)
      revalidatePath('/admin/families')
    }
  }
  return {}
}

// ── Families inline-edit ──────────────────────────────────────────────

type ContactPatch = {
  name?: string | null
  role?: string | null
  phone?: string | null
  email?: string | null
}

type BillingPrefsPatch = {
  payment_method?: string | null
  invoice_pref?: string | null
  rate?: string | null
  package_type?: string | null
}

/**
 * Inline-edit a single family from the family detail page. Patches a
 * single field at a time. Auths admin. JSONB sub-objects (primary_contact,
 * secondary_contact, billing_prefs) merge with existing — pass `null` on
 * a sub-key to clear it.
 *
 * Plan 24 — added to replace the page-bottom <FamilyEditForm> with
 * click-to-edit cells.
 */
export async function updateFamilyInline(
  familyId: string,
  patch: {
    family_name?: string
    preferred_name?: string | null
    address?: string | null
    notes?: string | null
    referred_by?: string | null
    status?: 'active' | 'inactive' | 'archived' | 'lead'
    primary_contact?: ContactPatch
    secondary_contact?: ContactPatch
    billing_prefs?: BillingPrefsPatch
  },
): Promise<{ error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  type FamilyUpdate = Record<string, unknown>
  const update: FamilyUpdate = {}

  if (patch.family_name !== undefined) {
    const v = patch.family_name.trim()
    if (!v) return { error: 'Family name is required' }
    update.family_name = v
  }
  if (patch.preferred_name !== undefined) update.preferred_name = patch.preferred_name?.trim() || null
  if (patch.address !== undefined) update.address = patch.address?.trim() || null
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null
  if (patch.referred_by !== undefined) update.referred_by = patch.referred_by?.trim() || null
  if (patch.status !== undefined) {
    if (!['active', 'inactive', 'archived', 'lead'].includes(patch.status)) {
      return { error: 'Invalid status' }
    }
    update.status = patch.status
  }

  // JSONB merge for contact + billing_prefs. Read current row, splice
  // patch keys into the sub-object, write back. Trim strings; empty →
  // remove the key.
  if (patch.primary_contact || patch.secondary_contact || patch.billing_prefs) {
    const { data: current, error: fetchErr } = await supabase
      .from('families')
      .select('primary_contact, secondary_contact, billing_prefs')
      .eq('id', familyId)
      .single()
    if (fetchErr || !current) {
      return { error: 'Family not found' }
    }

    function mergeContact(existing: unknown, p: ContactPatch | undefined): Record<string, string> | null {
      if (!p) return (existing as Record<string, string> | null) ?? null
      const base = (existing as Record<string, string> | null) ?? {}
      const next = { ...base }
      for (const k of ['name', 'role', 'phone', 'email'] as const) {
        if (p[k] !== undefined) {
          const v = p[k]?.trim() ?? ''
          if (v) next[k] = v
          else delete next[k]
        }
      }
      return Object.keys(next).length > 0 ? next : null
    }

    function mergePrefs(existing: unknown, p: BillingPrefsPatch | undefined): Record<string, string> | null {
      if (!p) return (existing as Record<string, string> | null) ?? null
      const base = (existing as Record<string, string> | null) ?? {}
      const next = { ...base }
      for (const k of ['payment_method', 'invoice_pref', 'rate', 'package_type'] as const) {
        if (p[k] !== undefined) {
          const v = p[k]?.trim() ?? ''
          if (v) next[k] = v
          else delete next[k]
        }
      }
      return Object.keys(next).length > 0 ? next : null
    }

    if (patch.primary_contact) {
      update.primary_contact = mergeContact(current.primary_contact, patch.primary_contact)
    }
    if (patch.secondary_contact) {
      update.secondary_contact = mergeContact(current.secondary_contact, patch.secondary_contact)
    }
    if (patch.billing_prefs) {
      update.billing_prefs = mergePrefs(current.billing_prefs, patch.billing_prefs)
    }
  }

  if (Object.keys(update).length === 0) return {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('families') as any).update(update).eq('id', familyId)
  if (error) {
    console.error('updateFamilyInline failed:', error.message)
    return { error: 'Update failed' }
  }

  revalidatePath(`/admin/families/${familyId}`)
  revalidatePath('/admin/families')

  // If status changed, cascade to players. 'lead' never cascades.
  if (patch.status !== undefined) {
    await cascadePlayersFromFamily(supabase, familyId, patch.status)
    revalidatePath('/admin/players')
  }

  return {}
}

// ── Invitations ────────────────────────────────────────────────────────

export async function createInvitation(familyId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createInvitationFormSchema)
  if (!parsed.success) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent(parsed.error)}`)
  }

  // Generate a URL-safe token
  const token = crypto.randomUUID()

  const user = await getSessionUser()

  // Plan 18 — invitations now expire 7d after creation. The form copy has
  // claimed this since day 1; the column was just never being written.
  // claim_invitation already enforces non-NULL expires_at.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: insertedInvite, error } = await supabase
    .from('invitations')
    .insert({
      family_id: familyId,
      email: parsed.data.email,
      token,
      status: 'pending',
      created_by: user?.id,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error || !insertedInvite) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent(error?.message ?? 'Could not create invite')}`)
  }

  // Plan 18 G1 — fire-and-forget branded invitation email via Resend.
  // The link is also returned inline so admin can SMS it as a fallback.
  try {
    const { sendInvitationEmail } = await import('@/lib/notifications/send-invitation')
    await sendInvitationEmail({ invitationId: insertedInvite.id })
  } catch (e) {
    console.error('[invitation] sendInvitationEmail failed:', e)
  }

  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}?invited=${encodeURIComponent(token)}`)
}

// Plan 18 — manual resend of an existing pending invitation email.
// Safe to call repeatedly; no DB mutation, just a re-fire of the email.
export async function resendInvitationEmail(invitationId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: inv, error } = await supabase
    .from('invitations')
    .select('id, family_id, status')
    .eq('id', invitationId)
    .single()

  if (error || !inv) {
    redirect('/admin?error=Invitation+not+found')
  }
  if (inv.status !== 'pending') {
    redirect(`/admin/families/${inv.family_id}?error=Invitation+already+claimed`)
  }

  try {
    const { sendInvitationEmail } = await import('@/lib/notifications/send-invitation')
    await sendInvitationEmail({ invitationId: inv.id })
  } catch (e) {
    console.error('[invitation] resendInvitationEmail failed:', e)
    redirect(`/admin/families/${inv.family_id}?error=Could+not+send+email`)
  }

  redirect(`/admin/families/${inv.family_id}?resent=1`)
}

// ── Programs ────────────────────────────────────────────────────────────

export async function createProgram(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createProgramFormSchema)
  if (!parsed.success) {
    redirect(`/admin/programs/new?error=${encodeURIComponent(parsed.error)}`)
  }

  const { name, type, level, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, max_capacity: maxCapacity, per_session_dollars: perSessionDollars, term_fee_dollars: termFeeDollars, description, allowed_classifications: allowedClassifications, gender_restriction: genderRestriction, track_required: trackRequired, early_pay_discount_pct: earlyPayDiscountPct, early_bird_deadline: earlyBirdDeadline, early_pay_discount_pct_tier2: earlyPayDiscountPctTier2, early_bird_deadline_tier2: earlyBirdDeadlineTier2 } = parsed.data

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
  const parsedClassifications = allowedClassifications
    ? allowedClassifications.split(',').map(s => s.trim()).filter(s => VALID_CLASSES.has(s))
    : []

  const { data, error } = await supabase
    .from('programs')
    .insert({
      name,
      type: type as string,
      level: (level || '') as string,
      day_of_week: dayOfWeek ? parseInt(dayOfWeek, 10) : null,
      start_time: startTime || null,
      end_time: endTime || null,
      max_capacity: maxCapacity ? parseInt(maxCapacity, 10) : null,
      per_session_cents: perSessionDollars ? Math.round(parseFloat(perSessionDollars) * 100) : null,
      term_fee_cents: termFeeDollars ? Math.round(parseFloat(termFeeDollars) * 100) : null,
      description: description || null,
      slug,
      status: 'active',
      allowed_classifications: parsedClassifications.length > 0 ? parsedClassifications : (level ? [level] : null),
      gender_restriction: genderRestriction || null,
      track_required: trackRequired || null,
      early_pay_discount_pct: earlyPayDiscountPct ? parseInt(earlyPayDiscountPct, 10) : null,
      early_bird_deadline: earlyBirdDeadline || null,
      early_pay_discount_pct_tier2: earlyPayDiscountPctTier2 ? parseInt(earlyPayDiscountPctTier2, 10) : null,
      early_bird_deadline_tier2: earlyBirdDeadlineTier2 || null,
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
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, updateProgramFormSchema)
  if (!parsed.success) {
    redirect(`/admin/programs/${id}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { name, type, level, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, max_capacity: maxCapacity, per_session_dollars: perSessionDollars, term_fee_dollars: termFeeDollars, description, status, allowed_classifications: allowedClassifications, gender_restriction: genderRestriction, track_required: trackRequired, early_pay_discount_pct: earlyPayDiscountPct, early_bird_deadline: earlyBirdDeadline, early_pay_discount_pct_tier2: earlyPayDiscountPctTier2, early_bird_deadline_tier2: earlyBirdDeadlineTier2 } = parsed.data

  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
  const parsedClassifications = allowedClassifications !== undefined && allowedClassifications !== null
    ? allowedClassifications.split(',').map(s => s.trim()).filter(s => VALID_CLASSES.has(s))
    : null

  const { error } = await supabase
    .from('programs')
    .update({
      name,
      type: type as string,
      level: (level || undefined) as string | undefined,
      day_of_week: dayOfWeek ? parseInt(dayOfWeek, 10) : null,
      start_time: startTime || null,
      end_time: endTime || null,
      max_capacity: maxCapacity ? parseInt(maxCapacity, 10) : null,
      per_session_cents: perSessionDollars ? Math.round(parseFloat(perSessionDollars) * 100) : null,
      term_fee_cents: termFeeDollars ? Math.round(parseFloat(termFeeDollars) * 100) : null,
      description: description || null,
      status: status || undefined,
      allowed_classifications: parsedClassifications,
      gender_restriction: genderRestriction || null,
      track_required: trackRequired || null,
      early_pay_discount_pct: earlyPayDiscountPct ? parseInt(earlyPayDiscountPct, 10) : null,
      early_bird_deadline: earlyBirdDeadline || null,
      early_pay_discount_pct_tier2: earlyPayDiscountPctTier2 ? parseInt(earlyPayDiscountPctTier2, 10) : null,
      early_bird_deadline_tier2: earlyBirdDeadlineTier2 || null,
    })
    .eq('id', id)

  if (error) {
    redirect(`/admin/programs/${id}?error=${encodeURIComponent(error.message)}`)
  }

  // Cascade time changes to all future scheduled sessions for this program.
  // Past, completed, and cancelled sessions are left untouched.
  const today = new Date().toLocaleDateString('en-CA')
  const { error: cascadeError } = await supabase
    .from('sessions')
    .update({
      start_time: startTime || null,
      end_time: endTime || null,
    })
    .eq('program_id', id)
    .eq('status', 'scheduled')
    .gte('date', today)

  if (cascadeError) {
    redirect(`/admin/programs/${id}?error=${encodeURIComponent(`Program updated, but failed to cascade to future sessions: ${cascadeError.message}`)}`)
  }

  revalidatePath(`/admin/programs/${id}`)
  revalidatePath('/admin/programs')
  redirect(`/admin/programs/${id}`)
}

// ── Sessions ───────────────────────────────────────────────────────────

export async function createSession(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createSessionFormSchema)
  if (!parsed.success) {
    redirect(`/admin/programs?error=${encodeURIComponent(parsed.error)}`)
  }

  const { program_id: programId, date, start_time: startTime, end_time: endTime, session_type: sessionType, coach_id: coachId, venue_id: venueId } = parsed.data

  const { error } = await supabase
    .from('sessions')
    .insert({
      program_id: programId || null,
      date,
      start_time: startTime || null,
      end_time: endTime || null,
      session_type: sessionType,
      coach_id: coachId || null,
      venue_id: venueId || null,
      status: 'scheduled',
    })

  if (error) {
    redirect(`/admin/programs?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/programs')
  redirect('/admin/programs')
}

export async function generateTermSessions(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, generateTermSessionsFormSchema)
  if (!parsed.success) {
    redirect(`/admin/programs?error=${encodeURIComponent(parsed.error)}`)
  }

  const { term, year } = parsed.data

  // Get term dates
  const { getTerm, isPublicHoliday } = await import('@/lib/utils/school-terms')
  const termInfo = getTerm(term, year)
  if (!termInfo) {
    redirect(`/admin/programs?error=${encodeURIComponent(`Term ${term} ${year} not found in school-terms config`)}`)
  }

  // Get all active programs with scheduling info
  const { data: programs } = await supabase
    .from('programs')
    .select('id, name, type, day_of_week, start_time, end_time, venue_id')
    .eq('status', 'active')
    .not('day_of_week', 'is', null)
    .not('start_time', 'is', null)

  if (!programs || programs.length === 0) {
    redirect(`/admin/programs?error=${encodeURIComponent('No active programs with scheduling info found')}`)
  }

  // Get primary coaches for each program
  const programIds = programs.map(p => p.id)
  const { data: programCoaches } = await supabase
    .from('program_coaches')
    .select('program_id, coach_id, role')
    .in('program_id', programIds)

  const coachByProgram = new Map<string, string>()
  programCoaches?.forEach(pc => {
    // Prefer 'primary' or 'lead' role, otherwise first coach
    if (!coachByProgram.has(pc.program_id) || pc.role === 'primary' || pc.role === 'lead') {
      coachByProgram.set(pc.program_id, pc.coach_id)
    }
  })

  // Get existing sessions for this term to avoid duplicates
  const startDate = termInfo.start.toISOString().split('T')[0]
  const endDate = termInfo.end.toISOString().split('T')[0]
  const { data: existingSessions } = await supabase
    .from('sessions')
    .select('program_id, date')
    .gte('date', startDate)
    .lte('date', endDate)

  const existingSet = new Set(
    existingSessions?.map(s => `${s.program_id}:${s.date}`) ?? []
  )

  // Generate sessions
  const sessionsToInsert: {
    program_id: string
    date: string
    start_time: string
    end_time: string
    session_type: string
    coach_id: string | null
    venue_id: string | null
    status: string
  }[] = []

  const current = new Date(termInfo.start)
  const end = new Date(termInfo.end)

  while (current <= end) {
    // JS getDay(): 0=Sun, 1=Mon...6=Sat
    const jsDay = current.getDay()

    if (!isPublicHoliday(current)) {
      for (const program of programs) {
        if (program.day_of_week === jsDay) {
          // Use local date parts — toISOString() shifts to UTC which is the previous day in AU
          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
          const key = `${program.id}:${dateStr}`

          if (!existingSet.has(key)) {
            const sessionType = program.type === 'competition' ? 'competition' : program.type === 'squad' ? 'squad' : program.type === 'school' ? 'school' : 'group'
            sessionsToInsert.push({
              program_id: program.id,
              date: dateStr,
              start_time: program.start_time!,
              end_time: program.end_time!,
              session_type: sessionType,
              coach_id: coachByProgram.get(program.id) ?? null,
              venue_id: program.venue_id ?? null,
              status: 'scheduled',
            })
          }
        }
      }
    }

    current.setDate(current.getDate() + 1)
  }

  if (sessionsToInsert.length === 0) {
    redirect(`/admin/programs?success=${encodeURIComponent(`No new sessions needed for T${term} ${year} - all sessions already exist`)}`)
  }

  // Insert in batches of 100
  let created = 0
  for (let i = 0; i < sessionsToInsert.length; i += 100) {
    const batch = sessionsToInsert.slice(i, i + 100)
    const { error } = await supabase.from('sessions').insert(batch)
    if (error) {
      console.error('Session generation batch error:', error.message)
      redirect(`/admin/programs?error=${encodeURIComponent(`Created ${created} sessions, then failed: ${error.message}`)}`)
    }
    created += batch.length
  }

  revalidatePath('/admin/sessions')
  redirect(`/admin/programs?success=${encodeURIComponent(`Generated ${created} sessions for T${term} ${year}`)}`)
}

export async function updateAttendance(sessionId: string, formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  // Parse attendance entries from form: attendance_PLAYERID = present|absent|noshow
  const entries: { playerId: string; status: string }[] = []
  formData.forEach((value, key) => {
    if (key.startsWith('attendance_')) {
      const playerId = key.replace('attendance_', '')
      const status = value as string
      const statusResult = attendanceStatusSchema.safeParse(status)
      if (statusResult.success) {
        entries.push({ playerId, status: statusResult.data })
      }
    }
  })

  // Get session details for billing context
  const { data: session } = await supabase
    .from('sessions')
    .select('id, program_id, session_type, date, start_time, coach_id, coaches:coach_id(name)')
    .eq('id', sessionId)
    .single()

  // Batch-fetch player first names for charge description formatting (3b)
  const playerNames = new Map<string, string>()
  if (entries.length > 0) {
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, first_name')
      .in('id', entries.map(e => e.playerId))
    for (const p of playerRows ?? []) playerNames.set(p.id, p.first_name)
  }
  const sessionDate = session?.date ?? null
  const termLabel = sessionDate ? getTermLabel(sessionDate) : null
  const privateCoachName = (session?.coaches as unknown as { name?: string } | null)?.name ?? null

  // Upsert attendance records
  for (const entry of entries) {
    await supabase
      .from('attendances')
      .upsert(
        { session_id: sessionId, player_id: entry.playerId, status: entry.status },
        { onConflict: 'session_id,player_id' }
      )
  }

  // ── Billing side effects ─────────────────────────────────────────────
  if (session?.program_id) {
    const programId = session.program_id
    const isPrivate = session.session_type === 'private'

    // Get program details
    const { data: program } = await supabase
      .from('programs')
      .select('type, name, per_session_cents')
      .eq('id', programId)
      .single()

    for (const entry of entries) {
      // Find the player's booking for this program
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, family_id, payment_option, sessions_charged')
        .eq('player_id', entry.playerId)
        .eq('program_id', programId)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: false })
        .limit(1)
        .single()

      // Walk-in fallback: no booking row means this player is being marked
      // attended without a prior enrolment. Mirror `adminAddWalkInAttendance`
      // and create a single-session charge so today's attendance is billed.
      // The charge gets absorbed cleanly when the family later enrols for
      // the term (gatherTermEnrolSessions picks it up at enrol time).
      // Only `present` triggers a walk-in charge — `absent`/`noshow` for a
      // non-rostered player has no policy meaning here.
      if (!booking) {
        if (entry.status !== 'present') continue
        const { data: walkInPlayer } = await supabase
          .from('players')
          .select('family_id')
          .eq('id', entry.playerId)
          .single()
        if (!walkInPlayer?.family_id) continue
        const walkInExisting = await getExistingSessionCharge(supabase, sessionId, entry.playerId)
        if (walkInExisting) continue
        const walkInBreakdown = await getPlayerEffectiveSessionPriceBreakdown(
          supabase, walkInPlayer.family_id, programId, program?.type, entry.playerId,
        )
        if (walkInBreakdown.priceCents <= 0) continue
        await createCharge(supabase, {
          familyId: walkInPlayer.family_id,
          playerId: entry.playerId,
          type: 'session',
          sourceType: 'attendance',
          sourceId: sessionId,
          sessionId,
          programId,
          description: formatChargeDescription({
            playerName: playerNames.get(entry.playerId),
            label: `${program?.name ?? 'Session'} (walk-in)`,
            suffix: formatDiscountSuffix({ multiGroupApplied: walkInBreakdown.multiGroupApplied, earlyPayPct: walkInBreakdown.earlyBirdPct }),
            term: termLabel,
            date: sessionDate,
          }),
          amountCents: walkInBreakdown.priceCents,
          status: 'confirmed',
          createdBy: user.id,
          pricingBreakdown: buildPricingBreakdown({
            basePriceCents: walkInBreakdown.basePriceCents,
            perSessionPriceCents: walkInBreakdown.priceCents,
            morningSquadPartnerApplied: walkInBreakdown.morningSquadPartnerApplied,
            multiGroupApplied: walkInBreakdown.multiGroupApplied,
            sessions: 1,
            earlyBirdPct: walkInBreakdown.earlyBirdPct,
          }) as never,
        })
        continue
      }

      const familyId = booking.family_id
      const paymentOption = booking.payment_option
      const existingCharge = await getExistingSessionCharge(supabase, sessionId, entry.playerId)
      // Player-aware: applies morning-squad partner rule + 25% multi-group recalc.
      const priceBreakdown = await getPlayerSessionPriceBreakdown(
        supabase, familyId, programId, program?.type, entry.playerId,
      )
      const sessionPrice = priceBreakdown.priceCents

      if (paymentOption === 'pay_later') {
        // ── Pay Later: charge per session as attended ──
        if (entry.status === 'present') {
          if (!existingCharge) {
            await createCharge(supabase, {
              familyId,
              playerId: entry.playerId,
              type: 'session',
              sourceType: 'attendance',
              sourceId: sessionId,
              sessionId,
              programId,
              bookingId: booking.id,
              description: formatChargeDescription({
                playerName: playerNames.get(entry.playerId),
                label: program?.name ?? 'Session',
                suffix: formatDiscountSuffix({ multiGroupApplied: priceBreakdown.multiGroupApplied, earlyPayPct: 0 }),
                term: termLabel,
                date: sessionDate,
              }),
              amountCents: sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
              pricingBreakdown: buildPricingBreakdown({
                basePriceCents: priceBreakdown.basePriceCents,
                perSessionPriceCents: priceBreakdown.priceCents,
                morningSquadPartnerApplied: priceBreakdown.morningSquadPartnerApplied,
                multiGroupApplied: priceBreakdown.multiGroupApplied,
                sessions: 1,
              }) as never,
            })
            // Increment sessions_charged
            await supabase.from('bookings').update({
              sessions_charged: (booking.sessions_charged ?? 0) + 1,
            }).eq('id', booking.id)
          }
        } else if (entry.status === 'noshow') {
          // No-show — first 2 per term get no charge, after that fully charged
          if (!existingCharge) {
            // Count existing no-show charges for this player/program
            const { count: noshowCount } = await supabase
              .from('attendances')
              .select('*', { count: 'exact', head: true })
              .eq('player_id', entry.playerId)
              .eq('status', 'noshow')
              .in('session_id', (await supabase.from('sessions').select('id').eq('program_id', programId)).data?.map(s => s.id) ?? [])

            if ((noshowCount ?? 0) > 2) {
              // 3rd+ no-show: fully charged (still applies multi-group recalc)
              await createCharge(supabase, {
                familyId,
                playerId: entry.playerId,
                type: 'session',
                sourceType: 'attendance',
                sourceId: sessionId,
                sessionId,
                programId,
                bookingId: booking.id,
                description: formatChargeDescription({
                  playerName: playerNames.get(entry.playerId),
                  label: program?.name ?? 'Session',
                  suffix: priceBreakdown.multiGroupApplied ? `No Show + ${25}% multi-group` : 'No Show',
                  term: termLabel,
                  date: sessionDate,
                }),
                amountCents: sessionPrice,
                status: 'confirmed',
                createdBy: user.id,
              })
            }
            // First 2 no-shows: no charge (credit)
          }
        } else if (entry.status === 'absent') {
          // Absent (notified): no charge. Void existing charge if one was already created.
          if (existingCharge) {
            await voidCharge(supabase, existingCharge.id, familyId)
          }
        }
      } else if (paymentOption === 'pay_now') {
        // ── Pay Now: already paid for term, only create credits ──
        if (entry.status === 'absent') {
          // Create a credit for the missed session (notified absence)
          if (!existingCharge) {
            await createCharge(supabase, {
              familyId,
              playerId: entry.playerId,
              type: 'credit',
              sourceType: 'attendance',
              sourceId: sessionId,
              sessionId,
              programId,
              bookingId: booking.id,
              description: formatChargeDescription({
                playerName: playerNames.get(entry.playerId),
                label: program?.name ?? 'Session',
                suffix: 'Absence credit',
                term: termLabel,
                date: sessionDate,
              }),
              amountCents: -sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
            })
          }
        } else if (session.session_type === 'makeup' && entry.status === 'present') {
          // Makeup session: charge at session rate (they used their credit)
          if (!existingCharge) {
            await createCharge(supabase, {
              familyId,
              playerId: entry.playerId,
              type: 'session',
              sourceType: 'attendance',
              sourceId: sessionId,
              sessionId,
              programId,
              bookingId: booking.id,
              description: formatChargeDescription({
                playerName: playerNames.get(entry.playerId),
                label: program?.name ?? 'Session',
                suffix: 'Makeup session',
                term: termLabel,
                date: sessionDate,
              }),
              amountCents: sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
            })
          }
        }
      } else if (isPrivate) {
        // ── Private lessons (may not have payment_option set) ──
        if (entry.status === 'present') {
          if (!existingCharge) {
            await createCharge(supabase, {
              familyId,
              playerId: entry.playerId,
              type: 'private',
              sourceType: 'attendance',
              sourceId: sessionId,
              sessionId,
              programId,
              bookingId: booking.id,
              description: formatChargeDescription({
                playerName: playerNames.get(entry.playerId),
                label: privateCoachName ? `Private w/ ${privateCoachName}` : 'Private lesson',
                date: sessionDate,
              }),
              amountCents: sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
            })
          }
        } else if (entry.status === 'absent') {
          // Absent (notified): full credit, void existing charge
          if (existingCharge) {
            await voidCharge(supabase, existingCharge.id, familyId)
          }
        } else if (entry.status === 'noshow') {
          // No-show private: 1st = 50% charge, 2nd+ = full charge
          if (!existingCharge) {
            const { count: priorNoShows } = await supabase
              .from('attendances')
              .select('*', { count: 'exact', head: true })
              .eq('player_id', entry.playerId)
              .eq('status', 'noshow')
              .neq('session_id', sessionId)
              .in('session_id', (await supabase.from('sessions').select('id').eq('program_id', programId).eq('session_type', 'private')).data?.map(s => s.id) ?? [])

            const chargeAmount = (priorNoShows ?? 0) === 0
              ? Math.round(sessionPrice * 0.5) // 1st no-show: 50%
              : sessionPrice // 2nd+: full

            await createCharge(supabase, {
              familyId,
              playerId: entry.playerId,
              type: 'private',
              sourceType: 'attendance',
              sourceId: sessionId,
              sessionId,
              programId,
              bookingId: booking.id,
              description: formatChargeDescription({
                playerName: playerNames.get(entry.playerId),
                label: privateCoachName ? `Private w/ ${privateCoachName}` : 'Private lesson',
                suffix: `No Show - ${(priorNoShows ?? 0) === 0 ? '50%' : 'full'} charge`,
                date: sessionDate,
              }),
              amountCents: chargeAmount,
              status: 'confirmed',
              createdBy: user.id,
            })
          }
        }
      }
    }
  }

  const programIdForRedirect = session?.program_id
  if (programIdForRedirect) {
    revalidatePath(`/admin/programs/${programIdForRedirect}/sessions/${sessionId}`)
    redirect(`/admin/programs/${programIdForRedirect}/sessions/${sessionId}`)
  }
  revalidatePath('/admin/programs')
  redirect('/admin/programs')
}

export async function cancelSession(sessionId: string, formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const parsed = parseCancellationFormData(formData)
  if ('error' in parsed) {
    // Try to figure out where to redirect with the validation error.
    const { data: session } = await supabase
      .from('sessions')
      .select('program_id')
      .eq('id', sessionId)
      .single()
    const pid = session?.program_id
    if (pid) {
      redirect(`/admin/programs/${pid}/sessions/${sessionId}?error=${encodeURIComponent(parsed.error)}`)
    }
    redirect(`/admin/programs?error=${encodeURIComponent(parsed.error)}`)
  }

  const result = await _cancelSingleSessionInternal(supabase, user.id, sessionId, {
    category: parsed.category,
    reason: parsed.reason!,
  })

  if (result.error) {
    const { data: session } = await supabase
      .from('sessions')
      .select('program_id')
      .eq('id', sessionId)
      .single()
    const pid = session?.program_id
    if (pid) {
      redirect(`/admin/programs/${pid}/sessions/${sessionId}?error=${encodeURIComponent(result.error)}`)
    }
    redirect(`/admin/programs?error=${encodeURIComponent(result.error)}`)
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  revalidatePath('/admin/programs')
  revalidatePath('/admin')
  redirect('/admin/programs')
}

// ── Cancel All Today's Sessions (formerly rainOutToday) ────────────────

/**
 * Cancel every scheduled session for today with a structured cancellation
 * reason. Replaces the legacy `rainOutToday()` — now category-aware and
 * routes notifications through the `admin.session.cancelled` dispatcher
 * rule (per family) instead of the legacy `sendNotificationToTarget`
 * direct-push helper. Per-user opt-out gating + email channel come along
 * for free.
 */
export async function cancelTodaySessions(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const parsed = parseCancellationFormData(formData)
  if ('error' in parsed) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error)}`)
  }

  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('date', today)
    .eq('status', 'scheduled')

  if (!sessions || sessions.length === 0) {
    redirect('/admin?error=No+scheduled+sessions+today+to+cancel')
  }

  let cancelled = 0
  const failedIds: string[] = []
  for (const session of sessions) {
    const res = await _cancelSingleSessionInternal(supabase, user.id, session.id, {
      category: parsed.category,
      reason: parsed.reason!,
    })
    if (res.error) {
      console.error('cancelTodaySessions: failed for session', session.id, res.error)
      failedIds.push(session.id)
    } else {
      cancelled += 1
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/programs')

  if (cancelled === 0) {
    redirect(`/admin?error=${encodeURIComponent('Failed to cancel any sessions; see logs.')}`)
  }
  const msg = failedIds.length > 0
    ? `Cancelled ${cancelled} session${cancelled !== 1 ? 's' : ''}. ${failedIds.length} failed.`
    : `Cancelled ${cancelled} session${cancelled !== 1 ? 's' : ''}. All families notified.`
  redirect(`/admin?success=${encodeURIComponent(msg)}`)
}

// ── Admin Booking on Behalf ────────────────────────────────────────────

// ── Inline session-management data loader for calendar modal ───────────

export type ManageSessionData = {
  sessionId: string
  programId: string | null
  programName: string | null
  programLevel: string | null
  durationMin: number
  date: string
  startTime: string | null
  endTime: string | null
  attendanceFormPlayers: Array<{ id: string; first_name: string; last_name: string; family_id: string; isWalkIn?: boolean }>
  attendanceMap: Record<string, 'present' | 'absent' | 'noshow'>
  families: import('@/components/admin/multi-player-picker').PickerFamily[]
  walkInExcludedIds: string[]
  termExcludedIds: string[]
  futureSessionCount: number
  earlyBirdTier1Pct: number | null
  earlyBirdTier2Pct: number | null
  initialCoaches: Array<{ id: string; name: string; role: string; isSub: boolean; rateCents: number | null; isOwner: boolean }>
  initialAttendance: Record<string, { status: 'present' | 'absent' | 'partial'; actual_minutes: number | null; note: string | null }>
  candidateSubCoaches: Array<{ id: string; name: string }>
}

/**
 * Server action that returns the same data shape the per-session detail page
 * (`/admin/programs/[id]/sessions/[sessionId]/page.tsx`) loads, so the
 * calendar's <ManageSessionModal> can render the same attendance / add-players
 * / coach-attendance UI without navigating off /admin.
 *
 * Admin-only. Returns `{ error }` on failure (modal renders inline banner).
 */
export async function getManageSessionData(sessionId: string): Promise<
  { data: ManageSessionData; error?: undefined } | { error: string; data?: undefined }
> {
  await requireAdmin()
  const supabase = await createClient()

  try {
    const { sessionDurationMin, attendanceMapForSession, deriveSessionCoachPay } = await import('@/lib/utils/coach-pay')

    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, program_id, date, start_time, end_time, coach_id, session_type, programs:program_id(id, name, level, early_pay_discount_pct, early_pay_discount_pct_tier2), coaches:coach_id(id, name, hourly_rate, is_owner)')
      .eq('id', sessionId)
      .single()

    if (sessionErr || !session) return { error: sessionErr?.message ?? 'Session not found' }

    const program = session.programs as unknown as { id: string; name: string; level: string; early_pay_discount_pct: number | null; early_pay_discount_pct_tier2: number | null } | null
    const sessionCoach = session.coaches as unknown as { id: string; name: string; hourly_rate: { group_rate_cents?: number } | null; is_owner: boolean } | null

    const durationMin = sessionDurationMin(session.start_time, session.end_time)
    const programId = program?.id ?? null

    // ── Roster + attendances ─────────────────────────────────────────────
    let rosterPlayers: { id: string; first_name: string; last_name: string; family_id: string }[] = []
    if (programId) {
      const { data: roster } = await supabase
        .from('program_roster')
        .select('players:player_id(id, first_name, last_name, family_id)')
        .eq('program_id', programId)
        .eq('status', 'enrolled')
      rosterPlayers = roster?.map(r => r.players as unknown as { id: string; first_name: string; last_name: string; family_id: string }).filter(Boolean) ?? []
    }

    const { data: attendances } = await supabase
      .from('attendances')
      .select('player_id, status, players:player_id(id, first_name, last_name, family_id)')
      .eq('session_id', sessionId)

    const rosterIds = new Set(rosterPlayers.map(p => p.id))
    const walkInPlayers = (attendances ?? [])
      .map(a => a.players as unknown as { id: string; first_name: string; last_name: string; family_id: string } | null)
      .filter((p): p is { id: string; first_name: string; last_name: string; family_id: string } => !!p && !rosterIds.has(p.id))

    const attendanceFormPlayers = [
      ...rosterPlayers.map(p => ({ ...p, isWalkIn: false })),
      ...walkInPlayers.map(p => ({ ...p, isWalkIn: true })),
    ]
    const attendanceMap = Object.fromEntries(
      (attendances ?? []).map(a => [a.player_id, a.status]),
    ) as Record<string, 'present' | 'absent' | 'noshow'>
    const presentInSession = attendanceFormPlayers.map(p => p.id)
    const enrolledInProgram = Array.from(rosterIds)

    // ── Active families + their players for the picker ───────────────────
    const { data: familyRows } = await supabase
      .from('families')
      .select(`
        id, display_id, family_name, primary_contact,
        players(id, first_name, last_name, classifications, status)
      `)
      .eq('status', 'active')
      .order('display_id')

    type RawFam = {
      id: string
      display_id: string
      family_name: string
      primary_contact: { name?: string } | null
      players: { id: string; first_name: string; last_name: string; classifications: string[] | null; status: string }[]
    }

    const families = (familyRows ?? []).map((row) => {
      const f = row as unknown as RawFam
      return {
        id: f.id,
        displayId: f.display_id,
        familyName: f.family_name,
        parentName: f.primary_contact?.name ?? null,
        players: (f.players ?? [])
          .filter(p => p.status === 'active')
          .map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            classifications: p.classifications ?? [],
          })),
      }
    })

    // ── Session count for retroactive term-enrol preview ─────────────────
    let futureSessionCount = 0
    if (programId && session.date) {
      const { data: rangeRaw } = await supabase
        .from('sessions')
        .select('id')
        .eq('program_id', programId)
        .in('status', ['scheduled', 'completed'])
        .gte('date', session.date)
      futureSessionCount = (rangeRaw ?? []).length
    }

    // ── Program coaches + coach attendance ───────────────────────────────
    const [{ data: programCoaches }, { data: coachAtt }, { data: allActiveCoaches }] = await Promise.all([
      programId
        ? supabase
            .from('program_coaches')
            .select('coach_id, role, coaches:coach_id(id, name, hourly_rate, is_owner)')
            .eq('program_id', programId)
        : Promise.resolve({ data: [] as Array<{ coach_id: string; role: string; coaches: unknown }> }),
      supabase
        .from('session_coach_attendances')
        .select('coach_id, status, actual_minutes, note')
        .eq('session_id', sessionId),
      supabase
        .from('coaches')
        .select('id, name, status, hourly_rate, is_owner')
        .eq('status', 'active')
        .order('name'),
    ])

    type SessionCoachAttRow = { coach_id: string; status: string; actual_minutes: number | null; note: string | null }
    const coachAttMap = attendanceMapForSession(
      ((coachAtt as unknown as SessionCoachAttRow[] | null) ?? []).map(r => ({
        coach_id: r.coach_id,
        status: r.status,
        actual_minutes: r.actual_minutes,
        note: r.note,
      })),
    )

    type CoachRow = { id: string; name: string; role: string; isSub: boolean; rateCents: number | null; isOwner: boolean }
    const initialCoachRows: CoachRow[] = []
    const knownCoachIds = new Set<string>()

    function pushCoach(coach: { id: string; name: string; hourly_rate: { group_rate_cents?: number } | null; is_owner: boolean }, role: string, isSub: boolean) {
      if (knownCoachIds.has(coach.id)) return
      knownCoachIds.add(coach.id)
      initialCoachRows.push({
        id: coach.id,
        name: coach.name,
        role,
        isSub,
        rateCents: coach.hourly_rate?.group_rate_cents ?? null,
        isOwner: !!coach.is_owner,
      })
    }

    for (const pc of programCoaches ?? []) {
      const coach = pc.coaches as unknown as { id: string; name: string; hourly_rate: { group_rate_cents?: number } | null; is_owner: boolean } | null
      if (coach) pushCoach(coach, pc.role, false)
    }
    if (sessionCoach) {
      pushCoach(sessionCoach, 'primary', false)
    }
    // Subs = coaches with attendance rows that aren't program/session coaches
    for (const [coachId] of coachAttMap) {
      if (knownCoachIds.has(coachId)) continue
      const subCoach = (allActiveCoaches ?? []).find(c => c.id === coachId)
      if (!subCoach) continue
      pushCoach(
        { id: subCoach.id, name: subCoach.name, hourly_rate: subCoach.hourly_rate as never, is_owner: subCoach.is_owner ?? false },
        'sub',
        true,
      )
    }

    const initialAttendance: Record<string, { status: 'present' | 'absent' | 'partial'; actual_minutes: number | null; note: string | null }> = {}
    for (const [cid, att] of coachAttMap) {
      initialAttendance[cid] = {
        status: att.status,
        actual_minutes: att.actual_minutes,
        note: att.note ?? null,
      }
    }

    const candidateSubCoaches = (allActiveCoaches ?? [])
      .filter(c => !knownCoachIds.has(c.id))
      .map(c => ({ id: c.id, name: c.name }))

    // Silence unused-var lint — keep `deriveSessionCoachPay` accessible to
    // consumers that hydrate pay-row totals (the modal renders the same
    // rows the session page does).
    void deriveSessionCoachPay

    return {
      data: {
        sessionId: session.id,
        programId,
        programName: program?.name ?? null,
        programLevel: program?.level ?? null,
        durationMin,
        date: session.date,
        startTime: session.start_time,
        endTime: session.end_time,
        attendanceFormPlayers,
        attendanceMap,
        families,
        walkInExcludedIds: presentInSession,
        termExcludedIds: enrolledInProgram,
        futureSessionCount,
        earlyBirdTier1Pct: program?.early_pay_discount_pct ?? null,
        earlyBirdTier2Pct: program?.early_pay_discount_pct_tier2 ?? null,
        initialCoaches: initialCoachRows,
        initialAttendance,
        candidateSubCoaches,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error loading session'
    console.error('getManageSessionData failed:', msg)
    return { error: msg }
  }
}

// ── Mark Session Complete ─────────────────────────────────────────────

export async function adminCompleteSession(sessionId: string) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, program_id, status')
    .eq('id', sessionId)
    .single()

  if (!session) {
    redirect('/admin/programs?error=Session+not+found')
  }

  if (session.status !== 'scheduled') {
    const pid = session.program_id
    if (pid) {
      redirect(`/admin/programs/${pid}/sessions/${sessionId}?error=Session+is+already+${session.status}`)
    }
    redirect('/admin/programs?error=Session+is+already+' + session.status)
  }

  // UX: the segmented attendance buttons default to "Present" visually for
  // every roster player who has no row yet. Confirming the session = persist
  // that default. Players the admin explicitly marked Absent / No-show
  // already have a row and are skipped here.
  if (session.program_id) {
    const [{ data: rosterRows }, { data: existingAtt }] = await Promise.all([
      supabase
        .from('program_roster')
        .select('player_id')
        .eq('program_id', session.program_id)
        .eq('status', 'enrolled'),
      supabase
        .from('attendances')
        .select('player_id')
        .eq('session_id', sessionId),
    ])
    const existingIds = new Set((existingAtt ?? []).map(a => a.player_id))
    const missingIds = (rosterRows ?? [])
      .map(r => r.player_id)
      .filter((id): id is string => !!id && !existingIds.has(id))

    if (missingIds.length > 0) {
      const { error: insertError } = await supabase
        .from('attendances')
        .insert(missingIds.map(playerId => ({
          session_id: sessionId,
          player_id: playerId,
          status: 'present',
        })))
      if (insertError) {
        console.error('[adminCompleteSession] default-Present insert failed:', insertError.message)
        // Don't block the complete — admin can mark attendance manually after.
      }
    }
  }

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'completed', completed_by: user.id })
    .eq('id', sessionId)

  if (error) {
    const pid = session.program_id
    if (pid) {
      redirect(`/admin/programs/${pid}/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/admin/programs?error=${encodeURIComponent(error.message)}`)
  }

  const pid = session.program_id
  if (pid) {
    revalidatePath(`/admin/programs/${pid}/sessions/${sessionId}`)
    redirect(`/admin/programs/${pid}/sessions/${sessionId}`)
  }
  revalidatePath('/admin/programs')
  redirect('/admin/programs')
}

// ── Reopen a completed session ─────────────────────────────────────────
//
// Admin escape hatch: flip status from 'completed' back to 'scheduled' so
// admin can correct attendance / coach attendance / charges after a
// premature Mark Complete. Doesn't touch attendance rows or charges —
// they stay as-is, ready for further edits.
//
// Refuses if the session is cancelled (use createSession or restoreSession
// path for that — out of scope here).
export async function adminReopenSession(sessionId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, program_id, status')
    .eq('id', sessionId)
    .single()

  if (!session) {
    redirect('/admin/programs?error=Session+not+found')
  }

  if (session.status !== 'completed') {
    const pid = session.program_id
    if (pid) {
      redirect(`/admin/programs/${pid}/sessions/${sessionId}?error=Only+completed+sessions+can+be+reopened`)
    }
    redirect('/admin/programs?error=Only+completed+sessions+can+be+reopened')
  }

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'scheduled' })
    .eq('id', sessionId)

  if (error) {
    const pid = session.program_id
    if (pid) {
      redirect(`/admin/programs/${pid}/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/admin/programs?error=${encodeURIComponent(error.message)}`)
  }

  const pid = session.program_id
  if (pid) {
    revalidatePath(`/admin/programs/${pid}/sessions/${sessionId}`)
    redirect(`/admin/programs/${pid}/sessions/${sessionId}?success=Session+reopened`)
  }
  revalidatePath('/admin/programs')
  redirect('/admin/programs')
}

// ── Bulk Enrol Players ─────────────────────────────────────────────────

export async function bulkEnrolPlayers(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const programId = formData.get('program_id') as string
  const playerIdsRaw = formData.get('player_ids') as string
  const bookingType = (formData.get('booking_type') as string) || 'term'
  const notes = ((formData.get('notes') as string) || '').trim() || null
  // Optional: when admin enrols FROM a specific session page, the term
  // charge fan-out should include that session and every later one
  // (regardless of past/future / attendance state). Default behaviour
  // (no field) is unchanged: future-scheduled + past-attended-Present.
  const fromSessionId = (formData.get('from_session_id') as string) || ''
  // Optional early-bird override (term enrolments only). 'auto' (default) uses
  // getActiveEarlyBird's date-based logic against the program's tier/deadline
  // config — same as the parent path. 'tier1' / 'tier2' / 'none' force the
  // corresponding pct regardless of today's date — for retroactive enrolments
  // where the deadline has passed but the family qualified under the original
  // timing.
  const earlyBirdOverrideRaw = (formData.get('early_bird_override') as string) || 'auto'
  const earlyBirdOverride: 'auto' | 'tier1' | 'tier2' | 'none' =
    earlyBirdOverrideRaw === 'tier1' || earlyBirdOverrideRaw === 'tier2' || earlyBirdOverrideRaw === 'none'
      ? earlyBirdOverrideRaw
      : 'auto'

  if (!programId || !playerIdsRaw) {
    redirect(`/admin/programs/${programId || ''}?error=${encodeURIComponent('Missing required fields')}`)
  }

  let playerIds: string[]
  try { playerIds = JSON.parse(playerIdsRaw) } catch { playerIds = [] }

  if (playerIds.length === 0) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent('No players selected')}`)
  }

  // Existing roster for these players (any status). UNIQUE(program_id,
  // player_id) — withdrawn rows must be reactivated, not re-INSERTed.
  const { data: existingRoster } = await supabase
    .from('program_roster')
    .select('id, player_id, status')
    .eq('program_id', programId)
    .in('player_id', playerIds)

  const existingByPlayer = new Map(
    (existingRoster ?? []).map(r => [r.player_id, r]),
  )

  const insertPlayerIds = playerIds.filter(id => !existingByPlayer.has(id))
  const reactivateRowIds = playerIds
    .map(id => existingByPlayer.get(id))
    .filter((r): r is { id: string; player_id: string; status: string } => !!r && r.status !== 'enrolled')
    .map(r => r.id)

  // newPlayerIds drives downstream booking/charge creation — keep it as the
  // set of players who actually became (re-)enrolled in this call.
  const newPlayerIds = [
    ...insertPlayerIds,
    ...playerIds.filter(id => {
      const row = existingByPlayer.get(id)
      return row && row.status !== 'enrolled'
    }),
  ]

  if (newPlayerIds.length === 0) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent('All selected players are already enrolled')}`)
  }

  if (insertPlayerIds.length > 0) {
    const rosterRows = insertPlayerIds.map(playerId => ({
      program_id: programId,
      player_id: playerId,
      status: 'enrolled',
    }))

    const { error: rosterError } = await supabase
      .from('program_roster')
      .insert(rosterRows)

    if (rosterError) {
      redirect(`/admin/programs/${programId}?error=${encodeURIComponent(rosterError.message)}`)
    }
  }

  if (reactivateRowIds.length > 0) {
    const { error: reactivateError } = await supabase
      .from('program_roster')
      .update({ status: 'enrolled', enrolled_at: new Date().toISOString() })
      .in('id', reactivateRowIds)

    if (reactivateError) {
      redirect(`/admin/programs/${programId}?error=${encodeURIComponent(reactivateError.message)}`)
    }
  }

  // ── Financial setup (mirrors parent enrolInProgram shape) ──────────────

  const isTermEnrollment = bookingType === 'term_enrollment' || bookingType === 'term'
  const isCasual = bookingType === 'casual'

  const [{ data: program }, { data: enrolledPlayers }] = await Promise.all([
    supabase
      .from('programs')
      .select('id, name, type, early_pay_discount_pct, early_bird_deadline, early_pay_discount_pct_tier2, early_bird_deadline_tier2')
      .eq('id', programId)
      .single(),
    supabase
      .from('players')
      .select('id, family_id, first_name')
      .in('id', newPlayerIds),
  ])

  // Resolve the active early-bird percent for this enrolment. With override =
  // 'auto' (the default), this mirrors the parent path's date-based detection.
  // Other override values force a specific tier (or none) regardless of date,
  // for retroactive enrolments where the family qualified under the original
  // timing but the deadline has now passed.
  const earlyBirdInfo: { pct: number; tier: 1 | 2 | null; deadline: string | null } = !isTermEnrollment
    ? { pct: 0, tier: null, deadline: null }
    : earlyBirdOverride === 'tier1'
    ? {
        pct: program?.early_pay_discount_pct ?? 0,
        tier: 1,
        deadline: program?.early_bird_deadline ?? null,
      }
    : earlyBirdOverride === 'tier2'
    ? {
        pct: program?.early_pay_discount_pct_tier2 ?? 0,
        tier: 2,
        deadline: program?.early_bird_deadline_tier2 ?? null,
      }
    : earlyBirdOverride === 'none'
    ? { pct: 0, tier: null, deadline: null }
    : getActiveEarlyBird({
        early_pay_discount_pct: program?.early_pay_discount_pct ?? null,
        early_bird_deadline: program?.early_bird_deadline ?? null,
        early_pay_discount_pct_tier2: program?.early_pay_discount_pct_tier2 ?? null,
        early_bird_deadline_tier2: program?.early_bird_deadline_tier2 ?? null,
      })

  const earlyBirdMeta = isTermEnrollment
    ? {
        tier: earlyBirdInfo.tier,
        deadline: earlyBirdInfo.deadline,
        tier2Pct: program?.early_pay_discount_pct_tier2 ?? null,
        tier2Deadline: program?.early_bird_deadline_tier2 ?? null,
      }
    : null

  // Optional retroactive-from-session-date: resolve the from_session_id
  // form field to a date once. When set, gatherTermEnrolSessions returns
  // every scheduled+completed session in the program from that date
  // onwards (regardless of past/future or attendance state) — used by the
  // session-page <AddPlayersCard> in term-enrol mode so admin enroling
  // mid-term from a specific session bills back to that session.
  let fromDate: string | undefined
  if (isTermEnrollment && fromSessionId) {
    const { data: fromSessionRow } = await supabase
      .from('sessions')
      .select('date, program_id')
      .eq('id', fromSessionId)
      .single()
    if (fromSessionRow?.program_id === programId && fromSessionRow.date) {
      fromDate = fromSessionRow.date
    }
  }

  // Per-player: gather combined sessions (past-attended + future-scheduled,
  // OR retroactive-from-date when fromDate is set), void absorbable
  // per-session charges, insert booking with financial fields, then
  // per-session charges (term) or single charge (casual). Trial = free,
  // no charges. Sessions are gathered per-player because different players
  // may have attended different past sessions; the future-session query
  // is the same per-player but the helper keeps the logic in one place.
  for (const p of enrolledPlayers ?? []) {
    let priceCents = 0
    let casualBreakdown: ReturnType<typeof buildPricingBreakdown> | null = null
    let casualMultiGroupApplied = false
    let perPlayerSessions: { id: string; date: string; start_time: string | null }[] = []
    let perPlayerAbsorbableIds: string[] = []

    if (isTermEnrollment) {
      const gathered = await gatherTermEnrolSessions(supabase, programId, p.id, fromDate ? { fromDate } : undefined)
      perPlayerSessions = gathered.combinedSessions
      perPlayerAbsorbableIds = gathered.absorbableChargeIds

      const breakdown = await getPlayerSessionPriceBreakdown(
        supabase, p.family_id, programId, program?.type, p.id,
      )
      const perSessionAfterEB = earlyBirdInfo.pct > 0
        ? Math.round(breakdown.priceCents * (100 - earlyBirdInfo.pct) / 100)
        : breakdown.priceCents
      priceCents = perSessionAfterEB * perPlayerSessions.length
    } else if (isCasual) {
      const breakdown = await getPlayerSessionPriceBreakdown(
        supabase, p.family_id, programId, program?.type, p.id,
      )
      priceCents = breakdown.priceCents
      casualMultiGroupApplied = breakdown.multiGroupApplied
      casualBreakdown = buildPricingBreakdown({
        basePriceCents: breakdown.basePriceCents,
        perSessionPriceCents: breakdown.priceCents,
        morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
        multiGroupApplied: breakdown.multiGroupApplied,
        sessions: 1,
      })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        family_id: p.family_id,
        player_id: p.id,
        program_id: programId,
        booking_type: bookingType,
        status: 'confirmed',
        booked_by: user?.id,
        notes,
        payment_option: isTermEnrollment ? 'pay_later' : null,
        price_cents: priceCents,
        discount_cents: 0,
        sessions_total: perPlayerSessions.length,
        sessions_charged: 0,
      })
      .select('id')
      .single()

    if (bookingError) {
      console.error('Bulk enrol booking failed for player', p.id, bookingError.message)
      continue
    }

    if (isTermEnrollment && booking && perPlayerSessions.length > 0) {
      // Void absorbable charges (walk-ins + partial-enrol leftovers for
      // sessions in this player's combined list) BEFORE creating new term
      // charges. Admin's JWT-scoped client has UPDATE policy on `charges`
      // (mirrors `updateAttendance`'s use of `voidCharge` directly).
      if (perPlayerAbsorbableIds.length > 0) {
        await voidAbsorbableCharges(supabase, perPlayerAbsorbableIds, p.family_id)
      }
      try {
        await createTermSessionCharges(supabase, {
          familyId: p.family_id,
          playerId: p.id,
          programId,
          bookingId: booking.id,
          programType: program?.type,
          earlyBirdPct: earlyBirdInfo.pct,
          earlyBirdMeta,
          chargeStatus: 'pending',
          createdBy: user.id,
          sessions: perPlayerSessions,
          playerName: p.first_name,
          programName: program?.name,
        })
      } catch (e) {
        console.error('Per-session charge creation failed (admin bulk enrol) for player', p.id, e instanceof Error ? e.message : e)
      }
    } else if (isCasual && priceCents > 0 && booking) {
      try {
        await createCharge(supabase, {
          familyId: p.family_id,
          playerId: p.id,
          type: 'casual',
          sourceType: 'enrollment',
          sourceId: booking.id,
          programId,
          bookingId: booking.id,
          description: formatChargeDescription({
            playerName: p.first_name,
            label: `${program?.name ?? 'Program'} - Casual session`,
            suffix: formatDiscountSuffix({ multiGroupApplied: casualMultiGroupApplied, earlyPayPct: 0 }),
            term: getTermLabel(new Date()),
          }),
          amountCents: priceCents,
          status: 'pending',
          createdBy: user.id,
          pricingBreakdown: casualBreakdown ? (casualBreakdown as never) : null,
        })
      } catch (e) {
        console.error('Casual charge creation failed (admin bulk enrol) for player', p.id, e instanceof Error ? e.message : e)
      }
    }
  }

  // Reverse stale claw-back adjustments per (re-)enrolled player.
  try {
    const { reverseAdjustmentsAfterEnrol } = await import('@/lib/utils/charge-recompute')
    for (const p of enrolledPlayers ?? []) {
      await reverseAdjustmentsAfterEnrol(supabase, p.family_id, p.id)
    }
  } catch (e) {
    console.error('Adjustment reversal failed (bulk enrol):', e instanceof Error ? e.message : e)
  }

  // Notification per player (rule-driven). One ding per child gives clean
  // grammar even when sibs are bulk-enrolled together. The {earlyBirdReminder}
  // placeholder is empty when the discount window is closed — keeps the body
  // honest. Leading space matches {ballColorSuffix} convention.
  const earlyBirdReminder = isTermEnrollment && earlyBirdInfo.pct > 0 && earlyBirdInfo.deadline
    ? ` Pay by ${formatDate(earlyBirdInfo.deadline)} to get ${earlyBirdInfo.pct}% off this term.`
    : ''

  for (const p of enrolledPlayers ?? []) {
    try {
      await dispatchNotification('admin.program.enrolled', {
        familyId: p.family_id,
        playerName: p.first_name ?? 'your child',
        programName: program?.name ?? 'a program',
        programId,
        earlyBirdReminder,
      })
    } catch (e) {
      console.error('Bulk enrol notification error for player', p.id, e instanceof Error ? e.message : 'Unknown error')
    }
  }

  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath('/admin/sessions')

  // Optional: stay on the originating session page when admin enrolled
  // from /admin/programs/[id]/sessions/[sessionId]. Defaults to program page.
  const returnToSessionId = (formData.get('return_to_session_id') as string) || ''
  const successMsg = `Enrolled ${newPlayerIds.length} player(s)`
  if (returnToSessionId) {
    revalidatePath(`/admin/programs/${programId}/sessions/${returnToSessionId}`)
    redirect(`/admin/programs/${programId}/sessions/${returnToSessionId}?success=${encodeURIComponent(successMsg)}`)
  }
  redirect(`/admin/programs/${programId}?success=${encodeURIComponent(successMsg)}`)
}

// ── Program Coach Management ─────────────────────────────────────────────

export async function setProgramLeadCoach(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const programId = formData.get('program_id') as string
  const coachId = (formData.get('coach_id') as string) || ''

  if (!programId) {
    redirect('/admin/programs?error=' + encodeURIComponent('Program id missing'))
  }

  // Remove any existing primary
  await supabase
    .from('program_coaches')
    .delete()
    .eq('program_id', programId)
    .eq('role', 'primary')

  if (coachId) {
    // If this coach is currently assistant on the same program, drop the assistant row first
    await supabase
      .from('program_coaches')
      .delete()
      .eq('program_id', programId)
      .eq('coach_id', coachId)
      .eq('role', 'assistant')

    const { error } = await supabase
      .from('program_coaches')
      .insert({ program_id: programId, coach_id: coachId, role: 'primary' })
    if (error) {
      redirect(`/admin/programs/${programId}?error=${encodeURIComponent(error.message)}`)
    }
  }

  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath('/admin/programs')
  redirect(`/admin/programs/${programId}?success=${encodeURIComponent('Lead coach updated')}`)
}

export async function addProgramAssistantCoach(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const programId = formData.get('program_id') as string
  const coachId = formData.get('coach_id') as string

  if (!programId || !coachId) {
    redirect('/admin/programs?error=' + encodeURIComponent('Missing fields'))
  }

  const { data: existing } = await supabase
    .from('program_coaches')
    .select('id, role')
    .eq('program_id', programId)
    .eq('coach_id', coachId)
    .maybeSingle()

  if (existing) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent('Coach already on this program')}`)
  }

  const { error } = await supabase
    .from('program_coaches')
    .insert({ program_id: programId, coach_id: coachId, role: 'assistant' })

  if (error) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath(`/admin/coaches/${coachId}`)
  redirect(`/admin/programs/${programId}?success=${encodeURIComponent('Assistant added')}`)
}

export async function removeProgramAssistantCoach(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const programId = formData.get('program_id') as string
  const coachId = formData.get('coach_id') as string

  if (!programId || !coachId) {
    redirect('/admin/programs?error=' + encodeURIComponent('Missing fields'))
  }

  const { error } = await supabase
    .from('program_coaches')
    .delete()
    .eq('program_id', programId)
    .eq('coach_id', coachId)
    .eq('role', 'assistant')

  if (error) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath(`/admin/coaches/${coachId}`)
  redirect(`/admin/programs/${programId}?success=${encodeURIComponent('Assistant removed')}`)
}

// ── Admin Unenrol Player from Program ────────────────────────────────────

export async function adminUnenrolFromProgram(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const programId = formData.get('program_id') as string
  const playerId = formData.get('player_id') as string

  if (!programId || !playerId) {
    redirect('/admin/programs?error=' + encodeURIComponent('Missing fields'))
  }

  const { data: rosterRow } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', programId)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .single()

  if (!rosterRow) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent('Player not on roster')}`)
  }

  const { error: rosterError } = await supabase
    .from('program_roster')
    .update({ status: 'withdrawn' })
    .eq('id', rosterRow.id)

  if (rosterError) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent(rosterError.message)}`)
  }

  // Void all future pending charges for this player+program.
  // Adelaide-aware: a 5am unenrol still voids the 6:45am session that hasn't started.
  const { data: futureCharges } = await supabase
    .from('charges')
    .select('id, family_id, session_id, sessions:session_id(date, start_time)')
    .eq('player_id', playerId)
    .eq('program_id', programId)
    .eq('status', 'pending')

  const { voidCharge } = await import('@/lib/utils/billing')
  const { isSessionFuture } = await import('@/lib/utils/sessions-filter')
  let voidedCount = 0
  for (const c of futureCharges ?? []) {
    const session = c.sessions as unknown as { date: string; start_time: string | null } | null
    if (session && isSessionFuture(session)) {
      await voidCharge(supabase, c.id, c.family_id)
      voidedCount++
    }
  }

  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath('/admin/programs')
  redirect(`/admin/programs/${programId}?success=${encodeURIComponent(`Unenrolled${voidedCount > 0 ? ` (${voidedCount} future charges voided)` : ''}`)}`)
}

// ── Admin Walk-In Attendance (add player not on roster) ──────────────────

export async function adminAddWalkInAttendance(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const sessionId = formData.get('session_id') as string
  const playerId = formData.get('player_id') as string
  const programId = formData.get('program_id') as string

  if (!sessionId || !playerId) {
    redirect(`/admin/programs/${programId}/sessions/${sessionId}?error=${encodeURIComponent('Missing fields')}`)
  }

  // Verify the player exists and grab family_id
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, family_id')
    .eq('id', playerId)
    .single()

  if (!player) {
    redirect(`/admin/programs/${programId}/sessions/${sessionId}?error=${encodeURIComponent('Player not found')}`)
  }

  // Check not already on attendance
  const { data: existing } = await supabase
    .from('attendances')
    .select('id')
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing) {
    redirect(`/admin/programs/${programId}/sessions/${sessionId}?error=${encodeURIComponent('Player already marked for this session')}`)
  }

  // Get session + program info for charge description and pricing
  const { data: session } = await supabase
    .from('sessions')
    .select('id, date, program_id, programs:program_id(name, type)')
    .eq('id', sessionId)
    .single()

  if (!session) {
    redirect(`/admin/programs/${programId}/sessions/${sessionId}?error=${encodeURIComponent('Session not found')}`)
  }

  const program = session.programs as unknown as { name: string; type: string | null } | null
  const effectiveProgramId = session.program_id ?? programId

  const { error: attError } = await supabase
    .from('attendances')
    .insert({
      session_id: sessionId,
      player_id: playerId,
      status: 'present',
    })

  if (attError) {
    redirect(`/admin/programs/${programId}/sessions/${sessionId}?error=${encodeURIComponent(attError.message)}`)
  }

  // Effective per-session price: inherits the term rate (incl. early-bird) when
  // the player is on the program roster; falls back to standard walk-in pricing
  // (respects family overrides + multi-group + morning-squad) otherwise.
  const breakdown = await getPlayerEffectiveSessionPriceBreakdown(
    supabase, player.family_id, effectiveProgramId, program?.type, playerId,
  )

  if (breakdown.priceCents > 0) {
    await createCharge(supabase, {
      familyId: player.family_id,
      playerId,
      type: 'session',
      sourceType: 'attendance',
      sourceId: sessionId,
      sessionId,
      programId: effectiveProgramId,
      description: formatChargeDescription({
        playerName: player.first_name,
        label: `${program?.name ?? 'Session'} (walk-in)`,
        suffix: formatDiscountSuffix({ multiGroupApplied: breakdown.multiGroupApplied, earlyPayPct: breakdown.earlyBirdPct }),
        term: getTermLabel(session.date),
        date: session.date,
      }),
      amountCents: breakdown.priceCents,
      status: 'confirmed',
      createdBy: user.id,
      pricingBreakdown: buildPricingBreakdown({
        basePriceCents: breakdown.basePriceCents,
        perSessionPriceCents: breakdown.priceCents,
        morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
        multiGroupApplied: breakdown.multiGroupApplied,
        sessions: 1,
        earlyBirdPct: breakdown.earlyBirdPct,
      }) as never,
    })
  }

  revalidatePath(`/admin/programs/${programId}/sessions/${sessionId}`)
  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath(`/admin/families/${player.family_id}`)
  redirect(`/admin/programs/${programId}/sessions/${sessionId}?success=${encodeURIComponent(`Added ${player.first_name} as walk-in`)}`)
}

// ── Plan 21 — admin family / player cleanup ────────────────────────────

/**
 * Format a blockers jsonb (`{attendances: 3, charges: 1}`) as a human
 * sentence: "3 attendances, 1 charge". Used to render the redirect
 * error when admin_delete_player / admin_delete_family returns
 * `blocked: true`.
 */
function formatBlockers(blockers: Record<string, number>): string {
  const LABELS: Record<string, [string, string]> = {
    attendances:    ['attendance',     'attendances'],
    charges:        ['charge',         'charges'],
    payments:       ['payment',        'payments'],
    invoices:       ['invoice',        'invoices'],
    bookings:       ['booking',        'bookings'],
    lesson_notes:   ['lesson note',    'lesson notes'],
    media:          ['media item',     'media items'],
    program_roster: ['program roster', 'program rosters'],
    team_members:   ['team membership', 'team memberships'],
    team_captain:   ['team captaincy', 'team captaincies'],
    competitions:   ['competition',    'competitions'],
    vouchers:       ['voucher',        'vouchers'],
    referrals:      ['referral',       'referrals'],
    messages:       ['message',        'messages'],
    players:        ['player',         'players'],
    family_pricing: ['pricing override', 'pricing overrides'],
    claimed_invites: ['claimed invitation', 'claimed invitations'],
  }
  const parts: string[] = []
  for (const [key, n] of Object.entries(blockers)) {
    const [singular, plural] = LABELS[key] ?? [key, key]
    parts.push(`${n} ${n === 1 ? singular : plural}`)
  }
  return parts.join(', ')
}

/**
 * Hard-delete a player. Goes through `admin_delete_player` RPC which
 * counts FK dependents and only deletes when the row is operational-
 * data-clean. If blocked, redirect with a human-readable error.
 *
 * Targets the approvals detail / family detail / player detail pages
 * — the redirect target is determined by the caller via `returnTo`.
 */
export async function deletePlayer(
  playerId: string,
  familyId: string,
  returnTo: 'approvals' | 'family' | 'player' = 'family',
) {
  await requireAdmin()
  const supabase = await createClient()

  // Validate UUID-shape before hitting the RPC.
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) {
    redirect('/admin?error=Invalid+player+id')
  }

  const { data, error } = await supabase.rpc('admin_delete_player', {
    p_player_id: playerId,
  })

  const successPath =
    returnTo === 'approvals' ? `/admin/approvals/${familyId}` :
    returnTo === 'player'    ? `/admin/families/${familyId}` :
                               `/admin/families/${familyId}`
  const errorPath =
    returnTo === 'approvals' ? `/admin/approvals/${familyId}` :
    returnTo === 'player'    ? `/admin/families/${familyId}/players/${playerId}` :
                               `/admin/families/${familyId}`

  if (error) {
    console.error('[admin/deletePlayer] rpc:', error.message)
    redirect(`${errorPath}?error=${encodeURIComponent('Delete failed')}`)
  }

  const result = data as
    | { success: boolean; blocked: boolean; deleted: boolean; blockers?: Record<string, number>; error?: string }
    | null

  if (!result || result.success === false) {
    if (result?.blocked && result.blockers) {
      const reason = formatBlockers(result.blockers)
      redirect(`${errorPath}?error=${encodeURIComponent(`Cannot delete — player has ${reason}. Archive instead.`)}`)
    }
    redirect(`${errorPath}?error=${encodeURIComponent(result?.error ?? 'Delete failed')}`)
  }

  revalidatePath('/admin/approvals')
  revalidatePath(`/admin/approvals/${familyId}`)
  revalidatePath(`/admin/families/${familyId}`)
  revalidatePath('/admin/players')
  redirect(`${successPath}?success=Player+deleted`)
}

/**
 * Hard-delete a family. Goes through `admin_delete_family` RPC. Only
 * succeeds when the family has zero players + zero operational rows.
 * For families with history, archive (status='archived') is the right
 * pattern — see setFamilyStatus below.
 */
export async function deleteFamily(
  familyId: string,
  returnTo: 'approvals' | 'family' = 'family',
) {
  await requireAdmin()
  const supabase = await createClient()

  if (!/^[0-9a-f-]{36}$/i.test(familyId)) {
    redirect('/admin?error=Invalid+family+id')
  }

  const { data, error } = await supabase.rpc('admin_delete_family', {
    p_family_id: familyId,
  })

  const errorPath =
    returnTo === 'approvals' ? `/admin/approvals/${familyId}` :
                               `/admin/families/${familyId}`

  if (error) {
    console.error('[admin/deleteFamily] rpc:', error.message)
    redirect(`${errorPath}?error=${encodeURIComponent('Delete failed')}`)
  }

  const result = data as
    | { success: boolean; blocked: boolean; deleted: boolean; blockers?: Record<string, number>; error?: string }
    | null

  if (!result || result.success === false) {
    if (result?.blocked && result.blockers) {
      const reason = formatBlockers(result.blockers)
      redirect(`${errorPath}?error=${encodeURIComponent(`Cannot delete — family has ${reason}. Archive instead.`)}`)
    }
    redirect(`${errorPath}?error=${encodeURIComponent(result?.error ?? 'Delete failed')}`)
  }

  revalidatePath('/admin/approvals')
  revalidatePath('/admin/families')
  redirect('/admin/families?success=Family+deleted')
}

/**
 * Bundled with Plan 25 — force-delete a test family.
 *
 * Calls admin_force_delete_test_family which CASCADEs through every
 * dependent row and refuses unless families.is_test=true. After the
 * RPC succeeds, renames the parent auth.users emails so the original
 * addresses are freed for re-signup (per debugging.md auth-user-delete
 * FK trap — we don't try to delete auth.users themselves).
 *
 * Only callable from /admin/families/[id] when family.is_test=true.
 */
export async function forceDeleteTestFamily(familyId: string) {
  await requireAdmin()
  const supabase = await createClient()

  if (!/^[0-9a-f-]{36}$/i.test(familyId)) {
    redirect('/admin?error=Invalid+family+id')
  }

  // RPC added 12-May-2026 — types.ts not yet regenerated, cast required.
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> })
    .rpc('admin_force_delete_test_family', {
      p_family_id: familyId,
    })

  const errorPath = `/admin/families/${familyId}`

  if (error) {
    console.error('[admin/forceDeleteTestFamily] rpc:', error.message)
    redirect(`${errorPath}?error=${encodeURIComponent('Force delete failed')}`)
  }

  const result = data as unknown as
    | { success: boolean; deleted?: boolean; error?: string; parent_user_ids?: string[]; counts?: Record<string, number>; display_id?: string }
    | null

  if (!result || result.success === false) {
    redirect(`${errorPath}?error=${encodeURIComponent(result?.error ?? 'Force delete failed')}`)
  }

  // Auth-side cleanup: rename emails so originals are freed. Per
  // debugging.md "Auth user delete blocked by FK" we don't delete the
  // auth.users row itself (audit_log FK + others would 500).
  const userIds = result.parent_user_ids ?? []
  if (userIds.length > 0) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const service = createServiceClient()
      const stamp = Date.now()
      for (const userId of userIds) {
        const { data: u } = await service.auth.admin.getUserById(userId)
        const orig = u?.user?.email
        if (!orig) continue
        // Skip if already archived
        if (orig.includes('+deleted-')) continue
        const local = orig.split('@')[0]
        const archivedEmail = `${local}+deleted-${stamp}@archived.invalid`
        await service.auth.admin.updateUserById(userId, {
          email: archivedEmail,
          email_confirm: true,
        })
      }
    } catch (e) {
      console.error('[admin/forceDeleteTestFamily] auth rename:', e)
      // Non-fatal — the public-schema delete already succeeded.
    }
  }

  revalidatePath('/admin/families')
  revalidatePath('/admin/approvals')
  redirect(`/admin/families?success=${encodeURIComponent('Test family ' + (result.display_id ?? '') + ' wiped')}`)
}

/**
 * Bundled with Plan 25 — toggle families.is_test flag.
 *
 * Required before forceDeleteTestFamily will accept a delete for this
 * family. Admin-only, no other side effects.
 */
export async function setFamilyIsTest(familyId: string, isTest: boolean) {
  await requireAdmin()
  const supabase = await createClient()

  if (!/^[0-9a-f-]{36}$/i.test(familyId)) {
    redirect('/admin?error=Invalid+family+id')
  }

  // `is_test` column added 12-May-2026 — types.ts not yet regenerated, cast required.
  const { error } = await supabase
    .from('families')
    .update({ is_test: isTest } as never)
    .eq('id', familyId)

  if (error) {
    console.error('[admin/setFamilyIsTest]:', error.message)
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent('Failed to update test flag')}`)
  }

  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}?success=${encodeURIComponent(isTest ? 'Marked as test family' : 'Unmarked test flag')}`)
}

/**
 * Set a family's status (active / inactive / archived). Archive is
 * the right pattern for families with operational history (charges,
 * sessions, lesson notes) — keeps the record but hides them from
 * default lists. Reverse with status='active'.
 */
export async function setFamilyStatus(
  familyId: string,
  status: 'active' | 'inactive' | 'archived',
) {
  await requireAdmin()
  const supabase = await createClient()

  if (!['active', 'inactive', 'archived'].includes(status)) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent('Invalid status')}`)
  }

  const { error } = await supabase
    .from('families')
    .update({ status })
    .eq('id', familyId)

  if (error) {
    console.error('[admin/setFamilyStatus]:', error.message)
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent('Update failed')}`)
  }

  // Cascade to players. 'archived' / 'inactive' / 'active' all bulk-flip
  // siblings; the danger-zone button only sends those three.
  await cascadePlayersFromFamily(supabase, familyId, status)

  revalidatePath('/admin/families')
  revalidatePath(`/admin/families/${familyId}`)
  revalidatePath('/admin/players')
  redirect(`/admin/families/${familyId}?success=${encodeURIComponent(`Family ${status === 'archived' ? 'archived' : status === 'inactive' ? 'set to inactive' : 'reactivated'}`)}`)
}

// ── Bulk walk-in attendance (multi-player from session detail page) ─────

/**
 * Insert N walk-in attendances + per-session walk-in charges in one batch.
 * Mirrors `adminAddWalkInAttendance` per player but tolerates per-row
 * failure — collects skipped/failed reasons. Returns a structured summary
 * for the client to render. Used by <AddPlayersCard> on the admin session
 * detail page.
 */
export async function bulkAddWalkInAttendance(args: {
  sessionId: string
  programId: string
  playerIds: string[]
}): Promise<{ error?: string; summary?: { added: number; skipped: number; failed: string[] } }> {
  const user = await requireAdmin()
  const supabase = await createClient()

  const { sessionId, programId, playerIds } = args

  if (!sessionId || !programId) return { error: 'Missing session or program' }
  if (!Array.isArray(playerIds) || playerIds.length === 0) return { error: 'No players selected' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, date, program_id, programs:program_id(name, type)')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Session not found' }

  const program = session.programs as unknown as { name: string; type: string | null } | null
  const effectiveProgramId = session.program_id ?? programId

  const { data: playerRows } = await supabase
    .from('players')
    .select('id, first_name, family_id')
    .in('id', playerIds)

  const { data: existingAtt } = await supabase
    .from('attendances')
    .select('player_id')
    .eq('session_id', sessionId)
    .in('player_id', playerIds)
  const alreadyMarked = new Set((existingAtt ?? []).map(a => a.player_id))

  let added = 0
  let skipped = 0
  const failed: string[] = []

  for (const player of playerRows ?? []) {
    if (alreadyMarked.has(player.id)) {
      skipped += 1
      continue
    }

    const { error: attError } = await supabase
      .from('attendances')
      .insert({
        session_id: sessionId,
        player_id: player.id,
        status: 'present',
      })

    if (attError) {
      failed.push(`${player.first_name}: ${attError.message}`)
      continue
    }

    const breakdown = await getPlayerEffectiveSessionPriceBreakdown(
      supabase, player.family_id, effectiveProgramId, program?.type, player.id,
    )

    if (breakdown.priceCents > 0) {
      await createCharge(supabase, {
        familyId: player.family_id,
        playerId: player.id,
        type: 'session',
        sourceType: 'attendance',
        sourceId: sessionId,
        sessionId,
        programId: effectiveProgramId,
        description: formatChargeDescription({
          playerName: player.first_name,
          label: `${program?.name ?? 'Session'} (walk-in)`,
          suffix: formatDiscountSuffix({ multiGroupApplied: breakdown.multiGroupApplied, earlyPayPct: breakdown.earlyBirdPct }),
          term: getTermLabel(session.date),
          date: session.date,
        }),
        amountCents: breakdown.priceCents,
        status: 'confirmed',
        createdBy: user.id,
        pricingBreakdown: buildPricingBreakdown({
          basePriceCents: breakdown.basePriceCents,
          perSessionPriceCents: breakdown.priceCents,
          morningSquadPartnerApplied: breakdown.morningSquadPartnerApplied,
          multiGroupApplied: breakdown.multiGroupApplied,
          sessions: 1,
          earlyBirdPct: breakdown.earlyBirdPct,
        }) as never,
      })
    }

    added += 1
  }

  revalidatePath(`/admin/programs/${programId}/sessions/${sessionId}`)
  revalidatePath(`/admin/programs/${programId}`)

  return { summary: { added, skipped, failed } }
}

// ── Coach attendance (per-session, captures partial minutes) ────────────

/**
 * Upsert one coach's attendance for a session. Enables marking a coach as
 * Present / Partial (with actual_minutes) / Absent. Drives the group-pay
 * derivation in `deriveSessionCoachPay` — every reader page (admin
 * overview, /admin/coaches, /admin/coaches/[coachId], program detail,
 * session detail) sees the recomputed pay on next render.
 *
 * Returns `{ error }` so client components can roll back optimistic state.
 */
export async function setSessionCoachAttendance(args: {
  sessionId: string
  coachId: string
  programId: string
  status: 'present' | 'absent' | 'partial'
  actualMinutes?: number | null
  note?: string | null
}): Promise<{ error?: string }> {
  const user = await requireAdmin()
  const supabase = await createClient()

  const { sessionId, coachId, programId, status, actualMinutes: rawMinutes, note: rawNote } = args

  if (!sessionId || !coachId) return { error: 'Missing fields' }
  if (!['present', 'absent', 'partial'].includes(status)) return { error: 'Invalid coach status' }

  const { data: session } = await supabase
    .from('sessions')
    .select('start_time, end_time')
    .eq('id', sessionId)
    .single()

  let durationMin = 60
  if (session?.start_time && session?.end_time) {
    const [sh, sm] = session.start_time.split(':').map(Number)
    const [eh, em] = session.end_time.split(':').map(Number)
    const calc = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))
    if (calc > 0) durationMin = calc
  }

  let actualMinutes: number | null = null
  if (status === 'partial') {
    if (rawMinutes != null && Number.isFinite(rawMinutes)) {
      actualMinutes = Math.max(0, Math.min(Math.round(rawMinutes), durationMin))
    } else {
      actualMinutes = durationMin
    }
  } else if (status === 'absent') {
    actualMinutes = 0
  } else {
    actualMinutes = null
  }

  const note = rawNote && rawNote.trim().length > 0 ? rawNote.trim().slice(0, 500) : null

  // Cast covers `actual_minutes` + `note` columns added in 20260519000001
  // (Supabase types not yet regenerated on this branch).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('session_coach_attendances') as any)
    .upsert(
      {
        session_id: sessionId,
        coach_id: coachId,
        status,
        actual_minutes: actualMinutes,
        note,
        marked_by: user.id,
      },
      { onConflict: 'session_id,coach_id' }
    )

  if (error) {
    console.error('[admin/setSessionCoachAttendance]:', error.message)
    return { error: 'Could not save coach attendance' }
  }

  revalidatePath(`/admin/programs/${programId}/sessions/${sessionId}`)
  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath(`/admin/coaches/${coachId}`)
  revalidatePath('/admin/coaches')
  revalidatePath('/admin')
  return {}
}

/**
 * Remove a coach attendance row entirely. Used to "un-add" a one-off sub
 * coach that admin added by mistake. For program-assigned coaches, set
 * status='absent' instead — the attendance row is the signal that the
 * coach was tracked at all.
 */
export async function removeSessionCoachAttendance(args: {
  sessionId: string
  coachId: string
  programId: string
}): Promise<{ error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  const { sessionId, coachId, programId } = args
  if (!sessionId || !coachId) return { error: 'Missing fields' }

  const { error } = await supabase
    .from('session_coach_attendances')
    .delete()
    .eq('session_id', sessionId)
    .eq('coach_id', coachId)

  if (error) {
    console.error('[admin/removeSessionCoachAttendance]:', error.message)
    return { error: 'Could not remove coach' }
  }

  revalidatePath(`/admin/programs/${programId}/sessions/${sessionId}`)
  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath(`/admin/coaches/${coachId}`)
  revalidatePath('/admin/coaches')
  revalidatePath('/admin')
  return {}
}

// ── Admin program detail cleanup (Plan 25 follow-up) ────────────────────

/**
 * Hard-delete a (player, program) pair via the `admin_delete_program_player_data`
 * RPC. cascade=false (default) refuses if any FK dependents exist and returns
 * a structured `blockers` map; cascade=true voids all charges + deletes
 * attendances + bookings + lesson_notes + roster row + recalculates
 * family_balance.
 */
export async function deleteProgramRosterEntry(args: {
  programId: string
  playerId: string
  cascade?: boolean
}): Promise<{
  error?: string
  blocked?: boolean
  blockers?: Record<string, number>
  deleted?: boolean
  cascade?: boolean
  rosterDeleted?: number
  cascadeStats?: {
    charges_voided?: number
    attendances_deleted?: number
    bookings_deleted?: number
    lesson_notes_deleted?: number
    roster_deleted?: number
  }
}> {
  await requireAdmin()
  const supabase = await createClient()

  const { programId, playerId, cascade = false } = args
  if (!programId || !playerId) return { error: 'Missing fields' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('admin_delete_program_player_data', {
    p_player_id: playerId,
    p_program_id: programId,
    p_cascade: cascade,
  })

  if (error) {
    console.error('[admin/deleteProgramRosterEntry]:', error.message)
    return { error: 'Delete failed' }
  }

  const result = data as {
    success: boolean
    blocked?: boolean
    deleted?: boolean
    cascade?: boolean
    blockers?: Record<string, number>
    error?: string
    charges_voided?: number
    attendances_deleted?: number
    bookings_deleted?: number
    lesson_notes_deleted?: number
    roster_deleted?: number
  } | null

  if (!result || result.success === false) {
    if (result?.blocked && result.blockers) {
      return { blocked: true, blockers: result.blockers }
    }
    return { error: result?.error ?? 'Delete failed' }
  }

  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath('/admin/programs')
  return {
    deleted: true,
    cascade: !!result.cascade,
    rosterDeleted: result.roster_deleted ?? 0,
    cascadeStats: result.cascade ? {
      charges_voided: result.charges_voided,
      attendances_deleted: result.attendances_deleted,
      bookings_deleted: result.bookings_deleted,
      lesson_notes_deleted: result.lesson_notes_deleted,
      roster_deleted: result.roster_deleted,
    } : undefined,
  }
}

/**
 * Bulk hard-delete N (player, program) pairs. Calls the RPC per-player and
 * collects per-row results. Tolerates per-row blockers/errors so one bad
 * row doesn't kill the batch.
 */
export async function bulkDeleteProgramRosterEntries(args: {
  programId: string
  playerIds: string[]
  cascade?: boolean
}): Promise<{
  error?: string
  results: Array<{
    playerId: string
    deleted?: boolean
    blocked?: boolean
    blockers?: Record<string, number>
    error?: string
  }>
}> {
  await requireAdmin()

  const { programId, playerIds, cascade = false } = args
  if (!programId) return { error: 'Missing program', results: [] }
  if (!Array.isArray(playerIds) || playerIds.length === 0) return { error: 'No players selected', results: [] }

  const results: Array<{
    playerId: string
    deleted?: boolean
    blocked?: boolean
    blockers?: Record<string, number>
    error?: string
  }> = []

  for (const playerId of playerIds) {
    const r = await deleteProgramRosterEntry({ programId, playerId, cascade })
    results.push({
      playerId,
      deleted: r.deleted,
      blocked: r.blocked,
      blockers: r.blockers,
      error: r.error,
    })
  }

  revalidatePath(`/admin/programs/${programId}`)
  return { results }
}

/**
 * Bulk soft-unenrol (status -> withdrawn). Loops the per-player path
 * inline (mirrors `adminUnenrolFromProgram` minus the redirect) so we can
 * collect a structured summary instead of relying on NEXT_REDIRECT.
 *
 * Voids future-only pending charges per player (Adelaide-aware via
 * `isSessionFuture`). Past + paid charges are untouched.
 */
export async function bulkUnenrolPlayersFromProgram(args: {
  programId: string
  playerIds: string[]
}): Promise<{
  error?: string
  summary?: {
    unenrolled: number
    skipped: number
    chargesVoided: number
    failed: string[]
  }
}> {
  await requireAdmin()
  const supabase = await createClient()

  const { programId, playerIds } = args
  if (!programId) return { error: 'Missing program' }
  if (!Array.isArray(playerIds) || playerIds.length === 0) return { error: 'No players selected' }

  const { voidCharge } = await import('@/lib/utils/billing')
  const { isSessionFuture } = await import('@/lib/utils/sessions-filter')

  let unenrolled = 0
  let skipped = 0
  let chargesVoided = 0
  const failed: string[] = []

  for (const playerId of playerIds) {
    const { data: rosterRow } = await supabase
      .from('program_roster')
      .select('id')
      .eq('program_id', programId)
      .eq('player_id', playerId)
      .eq('status', 'enrolled')
      .maybeSingle()

    if (!rosterRow) {
      skipped += 1
      continue
    }

    const { error: rosterError } = await supabase
      .from('program_roster')
      .update({ status: 'withdrawn' })
      .eq('id', rosterRow.id)

    if (rosterError) {
      failed.push(`${playerId}: ${rosterError.message}`)
      continue
    }

    const { data: futureCharges } = await supabase
      .from('charges')
      .select('id, family_id, session_id, sessions:session_id(date, start_time)')
      .eq('player_id', playerId)
      .eq('program_id', programId)
      .eq('status', 'pending')

    for (const c of futureCharges ?? []) {
      const session = c.sessions as unknown as { date: string; start_time: string | null } | null
      if (session && isSessionFuture(session)) {
        await voidCharge(supabase, c.id, c.family_id)
        chargesVoided += 1
      }
    }

    unenrolled += 1
  }

  revalidatePath(`/admin/programs/${programId}`)
  return { summary: { unenrolled, skipped, chargesVoided, failed } }
}
