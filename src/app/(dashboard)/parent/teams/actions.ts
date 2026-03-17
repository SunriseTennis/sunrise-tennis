'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

export async function respondToAvailability(teamId: string, formData: FormData) {
  const supabase = await createClient()
  const auth = await getParentFamilyId()
  if (!auth) redirect('/login')

  // Get family's players on this team
  const { data: familyPlayers } = await supabase
    .from('players')
    .select('id')
    .eq('family_id', auth.familyId)

  const playerIds = new Set(familyPlayers?.map((p) => p.id) ?? [])

  // Process form data: entries like `status_PLAYERID_DATE = available|unavailable|maybe`
  const updates: { playerId: string; matchDate: string; status: string; note: string }[] = []
  formData.forEach((value, key) => {
    if (key.startsWith('status_')) {
      const parts = key.split('_')
      const playerId = parts[1]
      const matchDate = parts.slice(2).join('-') // Rejoin date parts
      if (playerIds.has(playerId)) {
        const noteKey = `note_${playerId}_${parts.slice(2).join('_')}`
        updates.push({
          playerId,
          matchDate,
          status: value as string,
          note: (formData.get(noteKey) as string) || '',
        })
      }
    }
  })

  for (const update of updates) {
    await supabase
      .from('availability')
      .update({
        status: update.status,
        responded_at: new Date().toISOString(),
        note: update.note || null,
      })
      .eq('team_id', teamId)
      .eq('player_id', update.playerId)
      .eq('match_date', update.matchDate)
  }

  revalidatePath(`/parent/teams/${teamId}`)
  redirect(`/parent/teams/${teamId}?success=Availability updated`)
}

export async function sendTeamMessage(teamId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const body = formData.get('body') as string
  if (!body?.trim()) return

  const { error } = await supabase
    .from('team_messages')
    .insert({
      team_id: teamId,
      sender_id: user.id,
      body: body.trim(),
    })

  if (error) {
    redirect(`/parent/teams/${teamId}/chat?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/parent/teams/${teamId}/chat`)
  redirect(`/parent/teams/${teamId}/chat`)
}
