'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { validateFormData, familyPricingFormSchema } from '@/lib/utils/validation'

export async function addFamilyPricing(familyId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  // Inject family_id into form data for validation
  formData.set('family_id', familyId)
  const parsed = validateFormData(formData, familyPricingFormSchema)
  if (!parsed.success) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const { program_id: programId, program_type: programType, per_session_dollars: perSessionDollars, term_fee_dollars: termFeeDollars, notes, valid_from: validFrom, valid_until: validUntil } = parsed.data

  const perSessionCents = perSessionDollars ? Math.round(parseFloat(perSessionDollars) * 100) : null
  const termFeeCents = termFeeDollars ? Math.round(parseFloat(termFeeDollars) * 100) : null

  if (!perSessionCents && !termFeeCents) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent('Please set at least one price override')}`)
  }

  const { error } = await supabase
    .from('family_pricing')
    .insert({
      family_id: familyId,
      program_id: programId || null,
      program_type: programType || null,
      per_session_cents: perSessionCents,
      term_fee_cents: termFeeCents,
      notes: notes || null,
      valid_from: validFrom || new Date().toISOString().split('T')[0],
      valid_until: validUntil || null,
    })

  if (error) {
    console.error('Family pricing insert failed:', error.message)
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent('Failed to add pricing override')}`)
  }

  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}`)
}

export async function removeFamilyPricing(familyId: string, pricingId: string) {
  await requireAdmin()
  const supabase = await createClient()

  await supabase.from('family_pricing').delete().eq('id', pricingId)

  revalidatePath(`/admin/families/${familyId}`)
  redirect(`/admin/families/${familyId}`)
}
