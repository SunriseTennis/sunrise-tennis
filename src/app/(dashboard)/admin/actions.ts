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
  getSessionPrice,
  getExistingSessionCharge,
  recalculateBalance,
} from '@/lib/utils/billing'

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

  const { family_name: familyName, contact_name: contactName, contact_phone: contactPhone, contact_email: contactEmail, address, referred_by: referredBy } = parsed.data

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

  const { family_name: familyName, contact_name: contactName, contact_phone: contactPhone, contact_email: contactEmail, address, status, notes, secondary_name: secondaryName, secondary_role: secondaryRole, secondary_phone: secondaryPhone, secondary_email: secondaryEmail } = parsed.data

  const primaryContact = {
    name: contactName,
    phone: contactPhone || undefined,
    email: contactEmail || undefined,
  }

  const secondaryContact = (secondaryName || secondaryPhone || secondaryEmail)
    ? {
        name: secondaryName || undefined,
        role: secondaryRole || undefined,
        phone: secondaryPhone || undefined,
        email: secondaryEmail || undefined,
      }
    : null

  const { error } = await supabase
    .from('families')
    .update({
      family_name: familyName,
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

  const { first_name: firstName, last_name: lastName, dob, ball_color: ballColor, level, medical_notes: medicalNotes } = parsed.data

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
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, updatePlayerFormSchema)
  if (!parsed.success) {
    redirect(`/admin/families/${familyId}/players/${playerId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { first_name: firstName, last_name: lastName, preferred_name: preferredName, gender, dob, ball_color: ballColor, level, medical_notes: medicalNotes, physical_notes: physicalNotes, current_focus: currentFocus, short_term_goal: shortTermGoal, long_term_goal: longTermGoal, comp_interest: compInterest, media_consent: mediaConsent } = parsed.data

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
      medical_notes: medicalNotes || null,
      physical_notes: physicalNotes || null,
      current_focus: currentFocus ? currentFocus.split(',').map((s) => s.trim()) : null,
      short_term_goal: shortTermGoal || null,
      long_term_goal: longTermGoal || null,
      comp_interest: compInterest || null,
      media_consent: mediaConsent === 'on',
    })
    .eq('id', playerId)

  if (error) {
    redirect(`/admin/families/${familyId}/players/${playerId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/families/${familyId}/players/${playerId}`)
  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}/players/${playerId}`)
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

  const { error } = await supabase
    .from('invitations')
    .insert({
      family_id: familyId,
      email: parsed.data.email,
      token,
      status: 'pending',
      created_by: user?.id,
    })

  if (error) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}?invited=${encodeURIComponent(token)}`)
}

// ── Programs ────────────────────────────────────────────────────────────

export async function createProgram(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createProgramFormSchema)
  if (!parsed.success) {
    redirect(`/admin/programs/new?error=${encodeURIComponent(parsed.error)}`)
  }

  const { name, type, level, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, max_capacity: maxCapacity, per_session_dollars: perSessionDollars, term_fee_dollars: termFeeDollars, description } = parsed.data

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

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

  const { name, type, level, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, max_capacity: maxCapacity, per_session_dollars: perSessionDollars, term_fee_dollars: termFeeDollars, description, status } = parsed.data

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
    })
    .eq('id', id)

  if (error) {
    redirect(`/admin/programs/${id}?error=${encodeURIComponent(error.message)}`)
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
    .select('id, program_id, session_type')
    .eq('id', sessionId)
    .single()

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
      const sessionPrice = await getSessionPrice(supabase, familyId, programId, program?.type)

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
              description: `${program?.name ?? 'Session'} - ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}`,
              amountCents: sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
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
              // 3rd+ no-show: fully charged
              await createCharge(supabase, {
                familyId,
                playerId: entry.playerId,
                type: 'session',
                sourceType: 'attendance',
                sourceId: sessionId,
                sessionId,
                programId,
                bookingId: booking.id,
                description: `${program?.name ?? 'Session'} - No Show`,
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
              description: `${program?.name ?? 'Session'} - Absence credit`,
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
              description: `${program?.name ?? 'Session'} - Makeup session`,
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
              description: `Private lesson - ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}`,
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
              description: `Private lesson - No Show (${(priorNoShows ?? 0) === 0 ? '50%' : 'full'} charge)`,
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
    .select('id, program_id')
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
          // Create credit for pre-paid session
          const sessionPrice = await getSessionPrice(supabase, familyId, programId, program?.type)
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
              description: `${program?.name ?? 'Session'} - Cancelled${reason ? ` (${reason})` : ''}`,
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

            const sessionPrice = await getSessionPrice(supabase, booking.family_id, session.program_id, program?.type)
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
                description: `${program?.name ?? 'Session'} - Rained out`,
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
