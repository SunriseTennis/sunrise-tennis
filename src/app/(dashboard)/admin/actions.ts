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

  const { family_name: familyName, contact_name: contactName, contact_phone: contactPhone, contact_email: contactEmail, address, status, notes } = parsed.data

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

  const { first_name: firstName, last_name: lastName, dob, ball_color: ballColor, level, medical_notes: medicalNotes, current_focus: currentFocus, short_term_goal: shortTermGoal, long_term_goal: longTermGoal, media_consent: mediaConsent } = parsed.data

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
    redirect(`/admin/sessions?error=${encodeURIComponent(parsed.error)}`)
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
    redirect(`/admin/sessions?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/sessions')
  redirect('/admin/sessions')
}

export async function updateAttendance(sessionId: string, formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  // Parse attendance entries from form: attendance_PLAYERID = present|absent|late|excused
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
        if (entry.status === 'present' || entry.status === 'late') {
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
        } else if (entry.status === 'absent') {
          // Unexcused absence — first 2 per term get no charge, after that fully charged
          if (!existingCharge) {
            // Count existing unexcused absence charges for this player/program
            const { count: unexcusedCount } = await supabase
              .from('attendances')
              .select('*', { count: 'exact', head: true })
              .eq('player_id', entry.playerId)
              .eq('status', 'absent')
              .in('session_id', (await supabase.from('sessions').select('id').eq('program_id', programId)).data?.map(s => s.id) ?? [])

            if ((unexcusedCount ?? 0) > 2) {
              // 3rd+ unexcused: fully charged
              await createCharge(supabase, {
                familyId,
                playerId: entry.playerId,
                type: 'session',
                sourceType: 'attendance',
                sourceId: sessionId,
                sessionId,
                programId,
                bookingId: booking.id,
                description: `${program?.name ?? 'Session'} - Absent (unexcused)`,
                amountCents: sessionPrice,
                status: 'confirmed',
                createdBy: user.id,
              })
            }
            // First 2 unexcused: no charge (credit)
          }
        } else if (entry.status === 'excused') {
          // Excused: no charge. Void existing charge if one was already created.
          if (existingCharge) {
            await voidCharge(supabase, existingCharge.id, familyId)
          }
        }
      } else if (paymentOption === 'pay_now') {
        // ── Pay Now: already paid for term, only create credits ──
        if (entry.status === 'excused') {
          // Create a credit for the missed session
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
              description: `${program?.name ?? 'Session'} - Excused absence credit`,
              amountCents: -sessionPrice,
              status: 'confirmed',
              createdBy: user.id,
            })
          }
        } else if (session.session_type === 'makeup' && (entry.status === 'present' || entry.status === 'late')) {
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
        if (entry.status === 'present' || entry.status === 'late') {
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
        } else if (entry.status === 'excused') {
          // Full credit for excused (24hrs+ notice or admin-approved)
          if (existingCharge) {
            await voidCharge(supabase, existingCharge.id, familyId)
          }
        } else if (entry.status === 'absent') {
          // Unexcused private absence: 1st = 50% charge, 2nd+ = full charge
          if (!existingCharge) {
            const { count: priorUnexcused } = await supabase
              .from('attendances')
              .select('*', { count: 'exact', head: true })
              .eq('player_id', entry.playerId)
              .eq('status', 'absent')
              .neq('session_id', sessionId)
              .in('session_id', (await supabase.from('sessions').select('id').eq('program_id', programId).eq('session_type', 'private')).data?.map(s => s.id) ?? [])

            const chargeAmount = (priorUnexcused ?? 0) === 0
              ? Math.round(sessionPrice * 0.5) // 1st unexcused: 50%
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
              description: `Private lesson - No-show (${(priorUnexcused ?? 0) === 0 ? '50%' : 'full'} charge)`,
              amountCents: chargeAmount,
              status: 'confirmed',
              createdBy: user.id,
            })
          }
        }
      }
    }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  redirect(`/admin/sessions/${sessionId}`)
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
    redirect(`/admin/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
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
  revalidatePath('/admin/sessions')
  redirect('/admin/sessions')
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
