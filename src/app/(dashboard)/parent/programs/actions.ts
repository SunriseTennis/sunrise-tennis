'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push/send'
import { createClient as createServiceClient } from '@supabase/supabase-js'

async function getParentFamilyId(): Promise<{ userId: string; familyId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) return null
  return { userId: user.id, familyId: userRole.family_id }
}

export async function enrolInProgram(programId: string, familyId: string, formData: FormData) {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth || auth.familyId !== familyId) redirect('/login')

  const playerId = formData.get('player_id') as string
  const bookingType = formData.get('booking_type') as string
  const notes = formData.get('notes') as string

  // Verify player belongs to this family
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('family_id', familyId)
    .single()

  if (!player) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent('Player not found')}`)
  }

  // Check not already enrolled
  const { data: existing } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', programId)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .single()

  if (existing) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent('Player is already enrolled in this program')}`)
  }

  // Check capacity
  const [{ data: program }, { count: enrolledCount }] = await Promise.all([
    supabase.from('programs').select('max_capacity').eq('id', programId).single(),
    supabase.from('program_roster').select('*', { count: 'exact', head: true }).eq('program_id', programId).eq('status', 'enrolled'),
  ])

  if (program?.max_capacity && enrolledCount !== null && enrolledCount >= program.max_capacity) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent('This program is full')}`)
  }

  // Add to roster
  const { error: rosterError } = await supabase
    .from('program_roster')
    .insert({
      program_id: programId,
      player_id: playerId,
      status: 'enrolled',
    })

  if (rosterError) {
    redirect(`/parent/programs/${programId}?error=${encodeURIComponent(rosterError.message)}`)
  }

  // Create a booking record
  const { error: bookingError } = await supabase
    .from('bookings')
    .insert({
      family_id: familyId,
      player_id: playerId,
      program_id: programId,
      booking_type: bookingType,
      status: 'confirmed',
      booked_by: auth.userId,
      notes: notes || null,
    })

  if (bookingError) {
    // Roster was added but booking record failed — not critical, just log
    console.error('Booking record failed:', bookingError.message)
  }

  // Send booking confirmation notification
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
        body: `Successfully enrolled in ${programInfo?.name ?? 'program'}.`,
        url: `/parent/programs/${programId}`,
        target_type: 'family',
        target_id: familyId,
        created_by: auth.userId,
      })
      .select('id')
      .single()

    if (notification) {
      await serviceClient
        .from('notification_recipients')
        .insert({ notification_id: notification.id, user_id: auth.userId })
    }

    await sendPushToUser(auth.userId, {
      title: 'Booking Confirmed',
      body: `Successfully enrolled in ${programInfo?.name ?? 'program'}.`,
      url: `/parent/programs/${programId}`,
    })
  } catch (e) {
    console.error('Booking notification failed:', e)
  }

  revalidatePath(`/parent/programs/${programId}`)
  revalidatePath('/parent/programs')
  revalidatePath('/parent')
  redirect(`/parent/programs/${programId}?success=${encodeURIComponent('Successfully enrolled!')}`)
}
