'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser, requireAdmin } from '@/lib/supabase/server'
import { sendNotificationToTarget } from '@/lib/push/send'
import { createClient as createServiceClient } from '@supabase/supabase-js'
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
import { getPlayerSessionPriceBreakdown, formatDiscountSuffix, buildPricingBreakdown } from '@/lib/utils/player-pricing'
import { getTermLabel } from '@/lib/utils/school-terms'

// ── Families ────────────────────────────────────────────────────────────

export async function createFamily(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createFamilyFormSchema)
  if (!parsed.success) {
    redirect(`/admin/families/new?error=${encodeURIComponent(parsed.error)}`)
  }

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
    ball_color: ballColor,
    level,
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

  const { error } = await supabase
    .from('players')
    .insert({
      family_id: familyId,
      first_name: firstName,
      last_name: lastName,
      dob: dob || null,
      gender: gender || null,
      ball_color: ballColor || null,
      level: level || null,
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

  const { first_name: firstName, last_name: lastName, preferred_name: preferredName, gender, dob, ball_color: ballColor, level, classifications, track, status, medical_notes: medicalNotes, current_focus: currentFocus, short_term_goal: shortTermGoal, long_term_goal: longTermGoal, comp_interest: compInterest, school } = parsed.data

  // Plan 20 — two granular consent toggles parsed from FormData.
  const coaching = formData.get('media_consent_coaching') === 'on'
  const social = formData.get('media_consent_social') === 'on'

  // Parse comma-separated classifications, filter to known values
  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
  const parsedClassifications = classifications
    ? classifications.split(',').map(s => s.trim()).filter(s => VALID_CLASSES.has(s))
    : []

  const { error } = await supabase
    .from('players')
    .update({
      first_name: firstName,
      last_name: lastName,
      preferred_name: preferredName || null,
      gender: gender || null,
      dob: dob || null,
      ball_color: ballColor || null,
      level: level || null,
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

/**
 * Inline-edit a single player from the admin players table. Accepts a partial
 * patch — only fields present in the payload are written. Auths admin and
 * filters classifications + track + status to known values.
 *
 * Used by `/admin/players` table cells that auto-save on change.
 */
export async function updatePlayerInline(
  playerId: string,
  patch: {
    classifications?: string[]
    track?: 'performance' | 'participation'
    status?: 'active' | 'inactive' | 'archived'
    ball_color?: string | null
    gender?: 'male' | 'female' | 'non_binary' | null
  },
): Promise<{ error?: string }> {
  await requireAdmin()
  const supabase = await createClient()

  const VALID_CLASSES = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
  const VALID_BALL = new Set(['blue', 'red', 'orange', 'green', 'yellow', 'competitive'])
  const VALID_GENDER = new Set(['male', 'female', 'non_binary'])

  type PlayerUpdate = {
    classifications?: string[]
    track?: string
    status?: string
    ball_color?: string | null
    gender?: string | null
  }
  const update: PlayerUpdate = {}

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
  if (patch.ball_color !== undefined) {
    if (patch.ball_color !== null && !VALID_BALL.has(patch.ball_color)) {
      return { error: 'Invalid ball colour' }
    }
    update.ball_color = patch.ball_color
  }
  if (patch.gender !== undefined) {
    if (patch.gender !== null && !VALID_GENDER.has(patch.gender)) {
      return { error: 'Invalid gender' }
    }
    update.gender = patch.gender
  }

  if (Object.keys(update).length === 0) return {}

  const { error } = await supabase.from('players').update(update).eq('id', playerId)
  if (error) {
    console.error('updatePlayerInline failed:', error.message)
    return { error: 'Update failed' }
  }

  revalidatePath('/admin/players')
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

      if (!booking) continue

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
  const reason = (formData.get('reason') as string)?.trim() || null

  // Get session details
  const { data: session } = await supabase
    .from('sessions')
    .select('id, program_id, date, session_type')
    .eq('id', sessionId)
    .single()

  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'cancelled',
      cancellation_reason: reason,
    })
    .eq('id', sessionId)

  if (error) {
    const pid = session?.program_id
    if (pid) {
      redirect(`/admin/programs/${pid}/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/admin/programs?error=${encodeURIComponent(error.message)}`)
  }

  // Private sessions: mask the coach slot so it doesn't auto-reappear as
  // available coach availability (group sessions don't use that machinery).
  if (session?.session_type === 'private') {
    const { maskCoachSlotOnAdminOrCoachCancel } = await import('@/lib/private-cancel')
    await maskCoachSlotOnAdminOrCoachCancel(supabase, sessionId, reason ?? 'Admin cancelled session')

    // Also flip any active bookings to cancelled with type='admin' so the
    // parent UI shows them correctly. Group bookings don't follow this path.
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_type: 'admin' })
      .eq('session_id', sessionId)
      .neq('status', 'cancelled')
  }

  // ── Create credits for all enrolled families ─────────────────────────
  if (session?.program_id) {
    const programId = session.program_id

    const { data: program } = await supabase
      .from('programs')
      .select('name, type')
      .eq('id', programId)
      .single()

    // Get all enrolled players
    const { data: roster } = await supabase
      .from('program_roster')
      .select('player_id')
      .eq('program_id', programId)
      .eq('status', 'enrolled')

    if (roster) {
      const affectedFamilies = new Set<string>()

      for (const rosterEntry of roster) {
        const playerId = rosterEntry.player_id

        // Find their booking
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
        affectedFamilies.add(familyId)

        // Check for existing charges on this session
        const existingCharge = await getExistingSessionCharge(supabase, sessionId, playerId)

        if (booking.payment_option === 'pay_later' && existingCharge) {
          // Void the existing charge
          await voidCharge(supabase, existingCharge.id, familyId)
        } else if (booking.payment_option === 'pay_now') {
          // Create credit for pre-paid session — at the player's current per-session
          // rate (multi-group + morning-squad partner aware) so credit reflects
          // what they're effectively paying per session, not the full program price.
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
                suffix: reason ? `Cancelled - ${reason}` : 'Cancelled',
                term: session?.date ? getTermLabel(session.date) : null,
                date: session?.date ?? null,
              }),
              amountCents: -sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
            })
          }
        }
      }

      // Recalculate balance for all affected families
      for (const fid of affectedFamilies) {
        await recalculateBalance(supabase, fid)
      }

      // Send notification to affected families
      try {
        const serviceClient = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        await serviceClient.from('notifications').insert({
          type: 'session_cancelled',
          title: 'Session Cancelled',
          body: `${program?.name ?? 'A session'} has been cancelled${reason ? `: ${reason}` : '.'}`,
          url: '/parent',
          target_type: 'program',
          target_id: programId,
          created_by: user.id,
        })

        await sendNotificationToTarget({
          title: 'Session Cancelled',
          body: `${program?.name ?? 'A session'} has been cancelled${reason ? `: ${reason}` : '.'}`,
          url: '/parent',
          targetType: 'program',
          targetId: programId,
        })
      } catch (e) {
        console.error('Cancel notification failed:', e instanceof Error ? e.message : 'Unknown error')
      }
    }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  revalidatePath('/admin/programs')
  redirect('/admin/programs')
}

// ── Rain-Out: Cancel All Today's Sessions ─────────────────────────────

export async function rainOutToday() {
  const user = await requireAdmin()
  const supabase = await createClient()

  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

  // Find all scheduled sessions for today
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, program_id')
    .eq('date', today)
    .eq('status', 'scheduled')

  if (!sessions || sessions.length === 0) {
    redirect('/admin?error=No+scheduled+sessions+today+to+cancel')
  }

  const reason = 'Rained out'
  const affectedProgramIds = new Set<string>()
  const allAffectedFamilies = new Set<string>()

  for (const session of sessions) {
    // Cancel the session
    await supabase
      .from('sessions')
      .update({ status: 'cancelled', cancellation_reason: reason })
      .eq('id', session.id)

    // Handle credits for enrolled families
    if (session.program_id) {
      affectedProgramIds.add(session.program_id)

      const { data: roster } = await supabase
        .from('program_roster')
        .select('player_id')
        .eq('program_id', session.program_id)
        .eq('status', 'enrolled')

      if (roster) {
        for (const rosterEntry of roster) {
          const { data: booking } = await supabase
            .from('bookings')
            .select('id, family_id, payment_option')
            .eq('player_id', rosterEntry.player_id)
            .eq('program_id', session.program_id)
            .eq('status', 'confirmed')
            .order('booked_at', { ascending: false })
            .limit(1)
            .single()

          if (!booking) continue

          allAffectedFamilies.add(booking.family_id)

          const existingCharge = await getExistingSessionCharge(supabase, session.id, rosterEntry.player_id)

          if (booking.payment_option === 'pay_later' && existingCharge) {
            await voidCharge(supabase, existingCharge.id, booking.family_id)
          } else if (booking.payment_option === 'pay_now') {
            const { data: program } = await supabase
              .from('programs')
              .select('name, type')
              .eq('id', session.program_id)
              .single()

            const { priceCents: sessionPrice } = await getPlayerSessionPriceBreakdown(
              supabase, booking.family_id, session.program_id, program?.type, rosterEntry.player_id,
            )
            if (!existingCharge) {
              await createCharge(supabase, {
                familyId: booking.family_id,
                playerId: rosterEntry.player_id,
                type: 'credit',
                sourceType: 'cancellation',
                sourceId: session.id,
                sessionId: session.id,
                programId: session.program_id,
                bookingId: booking.id,
                description: formatChargeDescription({
                  label: program?.name ?? 'Session',
                  suffix: 'Rained out',
                  term: getTermLabel(today),
                  date: today,
                }),
                amountCents: -sessionPrice,
                status: 'confirmed',
                createdBy: user.id,
              })
            }
          }
        }
      }
    }
  }

  // Recalculate balances
  for (const fid of allAffectedFamilies) {
    await recalculateBalance(supabase, fid)
  }

  // Send notifications per affected program
  try {
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    for (const programId of affectedProgramIds) {
      const { data: program } = await supabase
        .from('programs')
        .select('name')
        .eq('id', programId)
        .single()

      await serviceClient.from('notifications').insert({
        type: 'rain_cancel',
        title: 'Session Cancelled - Weather',
        body: `${program?.name ?? 'Today\'s session'} has been cancelled due to weather. No charge for this session.`,
        url: '/parent',
        target_type: 'program',
        target_id: programId,
        created_by: user.id,
      })

      await sendNotificationToTarget({
        title: 'Session Cancelled - Weather',
        body: `${program?.name ?? 'Today\'s session'} has been cancelled due to weather. No charge for this session.`,
        url: '/parent',
        targetType: 'program',
        targetId: programId,
      })
    }
  } catch (e) {
    console.error('Rain-out notification failed:', e instanceof Error ? e.message : 'Unknown error')
  }

  revalidatePath('/admin')
  revalidatePath('/admin/programs')
  redirect(`/admin?success=${encodeURIComponent(`Rained out ${sessions.length} session${sessions.length !== 1 ? 's' : ''}. All families notified.`)}`)
}

// ── Admin Booking on Behalf ────────────────────────────────────────────

export async function adminBookPlayer(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const { validateFormData, adminBookPlayerFormSchema } = await import('@/lib/utils/validation')
  const parsed = validateFormData(formData, adminBookPlayerFormSchema)
  if (!parsed.success) {
    redirect(`/admin/programs?error=${encodeURIComponent(parsed.error)}`)
  }

  const { family_id: familyId, player_id: playerId, program_id: programId, booking_type: bookingType, notes } = parsed.data

  // Add to roster if term/casual enrolment
  const { data: existing } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', programId)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .single()

  if (!existing) {
    await supabase
      .from('program_roster')
      .insert({
        program_id: programId,
        player_id: playerId,
        status: 'enrolled',
      })
  }

  // Create booking record
  const { error } = await supabase
    .from('bookings')
    .insert({
      family_id: familyId,
      player_id: playerId,
      program_id: programId,
      booking_type: bookingType,
      status: 'confirmed',
      booked_by: user?.id,
      notes,
    })

  if (error) {
    console.error('Admin booking failed:', error.message)
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent('Failed to create booking')}`)
  }

  // Send booking confirmation notification to parent
  try {
    const { data: programInfo } = await supabase
      .from('programs')
      .select('name')
      .eq('id', programId)
      .single()

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: notification } = await serviceClient
      .from('notifications')
      .insert({
        type: 'booking_confirmation',
        title: 'Booking Confirmed',
        body: `Your child has been enrolled in ${programInfo?.name ?? 'a program'} by the admin.`,
        url: `/parent/programs/${programId}`,
        target_type: 'family',
        target_id: familyId,
        created_by: user?.id,
      })
      .select('id')
      .single()

    const userIds = await sendNotificationToTarget({
      title: 'Booking Confirmed',
      body: `Your child has been enrolled in ${programInfo?.name ?? 'a program'} by the admin.`,
      url: `/parent/programs/${programId}`,
      targetType: 'family',
      targetId: familyId,
    })

    if (notification && userIds.length > 0) {
      await serviceClient
        .from('notification_recipients')
        .insert(userIds.map((uid) => ({ notification_id: notification.id, user_id: uid })))
    }
  } catch (e) {
    console.error('Booking notification failed:', e instanceof Error ? e.message : 'Unknown error')
  }

  revalidatePath(`/admin/programs/${programId}`)
  revalidatePath('/admin/sessions')
  redirect(`/admin/programs/${programId}`)
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

// ── Bulk Enrol Players ─────────────────────────────────────────────────

export async function bulkEnrolPlayers(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const programId = formData.get('program_id') as string
  const playerIdsRaw = formData.get('player_ids') as string
  const bookingType = (formData.get('booking_type') as string) || 'term'

  if (!programId || !playerIdsRaw) {
    redirect(`/admin/programs/${programId || ''}?error=${encodeURIComponent('Missing required fields')}`)
  }

  let playerIds: string[]
  try { playerIds = JSON.parse(playerIdsRaw) } catch { playerIds = [] }

  if (playerIds.length === 0) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent('No players selected')}`)
  }

  // Get existing roster to skip duplicates
  const { data: existingRoster } = await supabase
    .from('program_roster')
    .select('player_id')
    .eq('program_id', programId)
    .eq('status', 'enrolled')

  const existingIds = new Set((existingRoster ?? []).map(r => r.player_id))
  const newPlayerIds = playerIds.filter(id => !existingIds.has(id))

  if (newPlayerIds.length === 0) {
    redirect(`/admin/programs/${programId}?error=${encodeURIComponent('All selected players are already enrolled')}`)
  }

  // Bulk insert roster entries
  const rosterRows = newPlayerIds.map(playerId => ({
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

  // Get player-family mapping for booking records
  const { data: playerFamilies } = await supabase
    .from('players')
    .select('id, family_id')
    .in('id', newPlayerIds)

  // Create booking records
  if (playerFamilies && playerFamilies.length > 0) {
    const bookingRows = playerFamilies.map(p => ({
      family_id: p.family_id,
      player_id: p.id,
      program_id: programId,
      booking_type: bookingType,
      status: 'confirmed',
      booked_by: user?.id,
    }))

    await supabase.from('bookings').insert(bookingRows)
  }

  // Send notification to each unique family
  try {
    const { data: programInfo } = await supabase
      .from('programs')
      .select('name')
      .eq('id', programId)
      .single()

    const familyIds = [...new Set((playerFamilies ?? []).map(p => p.family_id))]
    for (const fid of familyIds) {
      await sendNotificationToTarget({
        title: 'Enrollment Confirmed',
        body: `Your child has been enrolled in ${programInfo?.name ?? 'a program'}.`,
        url: `/parent/programs/${programId}`,
        targetType: 'family',
        targetId: fid,
      })
    }
  } catch (e) {
    console.error('Bulk enrol notification error:', e)
  }

  revalidatePath(`/admin/programs/${programId}`)
  redirect(`/admin/programs/${programId}?success=${encodeURIComponent(`Enrolled ${newPlayerIds.length} player(s)`)}`)
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

  // Create charge using player-aware pricing helper (respects family overrides + multi-group + morning-squad)
  const breakdown = await getPlayerSessionPriceBreakdown(
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
        suffix: formatDiscountSuffix({ multiGroupApplied: breakdown.multiGroupApplied, earlyPayPct: 0 }),
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

  revalidatePath('/admin/families')
  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}?success=${encodeURIComponent(`Family ${status === 'archived' ? 'archived' : status === 'inactive' ? 'set to inactive' : 'reactivated'}`)}`)
}
