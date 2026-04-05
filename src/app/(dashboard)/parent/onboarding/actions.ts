'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { checkRateLimitAsync } from '@/lib/utils/rate-limit'
import { validateFormData } from '@/lib/utils/validation'

// ── Shared auth helper ──────────────────────────────────────────────────

async function getOnboardingAuth(): Promise<{ userId: string; familyId: string }> {
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
  return { userId: user.id, familyId: userRole.family_id }
}

// ── Validation schemas ──────────────────────────────────────────────────

const onboardingContactSchema = z.object({
  contact_name: z.string().trim().min(1, 'Full name is required').max(500),
  contact_phone: z.string().trim().max(50).optional().or(z.literal('')),
})

const onboardingPlayerSchema = z.object({
  player_id: z.string().uuid('Invalid player ID'),
  first_name: z.string().trim().min(1, 'First name is required').max(200),
  dob: z.string().trim().max(20).optional().or(z.literal('')),
})

// ── Step 1: Update contact details ─────────────────────────────────────

export async function updateOnboardingContact(formData: FormData) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  // Rate limit: 10 saves per minute
  if (!await checkRateLimitAsync(`onboarding-contact:${userId}`, 10, 60_000)) {
    redirect('/parent/onboarding?step=1&error=Too+many+requests.+Please+wait.')
  }

  const parsed = validateFormData(formData, onboardingContactSchema)
  if (!parsed.success) {
    redirect(`/parent/onboarding?step=1&error=${encodeURIComponent(parsed.error)}`)
  }

  const { contact_name, contact_phone } = parsed.data

  // Read current family to preserve email in primary_contact
  const { data: family } = await supabase
    .from('families')
    .select('primary_contact')
    .eq('id', familyId)
    .single()

  const existing = (family?.primary_contact ?? {}) as Record<string, string>

  const primaryContact = {
    ...existing,
    name: contact_name,
    phone: contact_phone || existing.phone || undefined,
  }

  const { error } = await supabase
    .from('families')
    .update({ primary_contact: primaryContact })
    .eq('id', familyId)

  if (error) {
    console.error('[onboarding] updateOnboardingContact:', error)
    redirect('/parent/onboarding?step=1&error=Failed+to+save.+Please+try+again.')
  }

  revalidatePath('/parent/onboarding')
  redirect('/parent/onboarding?step=2')
}

// ── Step 2: Update player details ──────────────────────────────────────

export async function updateOnboardingPlayers(formData: FormData) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  // Rate limit: 10 saves per minute
  if (!await checkRateLimitAsync(`onboarding-players:${userId}`, 10, 60_000)) {
    redirect('/parent/onboarding?step=2&error=Too+many+requests.+Please+wait.')
  }

  // Collect all player_id_* entries from formData
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
      onboardingPlayerSchema,
    )

    if (!parsed.success) {
      redirect(`/parent/onboarding?step=2&error=${encodeURIComponent(parsed.error)}`)
    }

    const { player_id, first_name, dob } = parsed.data

    // Verify parent owns this player
    const { data: owned } = await supabase
      .from('players')
      .select('id')
      .eq('id', player_id)
      .eq('family_id', familyId)
      .single()

    if (!owned) continue // silently skip players not owned by this family

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

// ── Step 3: Complete onboarding ─────────────────────────────────────────

export async function completeOnboarding(pushSubscription: string | null) {
  const { userId, familyId } = await getOnboardingAuth()
  const supabase = await createClient()

  // Rate limit: 5 completes per minute (shouldn't be hit normally)
  if (!await checkRateLimitAsync(`onboarding-complete:${userId}`, 5, 60_000)) {
    redirect('/parent/onboarding?step=3&error=Too+many+requests.')
  }

  // Save push subscription if provided
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
      // Non-fatal — push subscription is optional
    }
  }

  // Mark onboarding complete
  const { error } = await supabase
    .from('families')
    .update({ completed_onboarding: true })
    .eq('id', familyId)

  if (error) {
    console.error('[onboarding] completeOnboarding:', error)
    redirect('/parent/onboarding?step=3&error=Failed+to+complete.+Please+try+again.')
  }

  revalidatePath('/parent')
  redirect('/parent')
}
