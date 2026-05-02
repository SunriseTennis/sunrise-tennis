'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { validateFormData, submitVoucherFormSchema, submitVoucherImageSchema } from '@/lib/utils/validation'
import { uploadVoucherFile } from '@/lib/utils/storage'
import { notifyAdmins } from '@/lib/notifications/notify'

async function getParentFamily() {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) {
    redirect('/parent/payments?error=' + encodeURIComponent('No family account linked'))
  }

  return { supabase, user, familyId: userRole.family_id }
}

async function rateLimitVoucher(userId: string) {
  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`voucher:${userId}`, 3, 60_000)) {
    redirect('/parent/payments?error=' + encodeURIComponent('Too many attempts. Please wait a moment.'))
  }
}

/**
 * Create voucher record(s). For $200, creates 2 linked records.
 */
async function createVoucherRecords(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  base: Record<string, any>,
  amount: '100' | '200',
) {
  // First voucher
  const { data: v1, error: e1 } = await supabase
    .from('vouchers')
    .insert({ ...base, voucher_number: 1 })
    .select('id')
    .single()

  if (e1 || !v1) {
    console.error('Voucher insert failed:', e1?.message)
    redirect('/parent/payments?error=' + encodeURIComponent('Failed to submit voucher'))
  }

  if (amount === '200') {
    // Second voucher linked to first
    const { data: v2, error: e2 } = await supabase
      .from('vouchers')
      .insert({ ...base, voucher_number: 2, linked_voucher_id: v1.id })
      .select('id')
      .single()

    if (e2 || !v2) {
      console.error('Second voucher insert failed:', e2?.message)
      redirect('/parent/payments?error=' + encodeURIComponent('Failed to submit second voucher'))
    }

    // Link first voucher back to second
    await supabase.from('vouchers').update({ linked_voucher_id: v2.id }).eq('id', v1.id)

    return [v1.id, v2.id]
  }

  return [v1.id]
}

export async function submitVoucherForm(formData: FormData) {
  const { supabase, user, familyId } = await getParentFamily()
  await rateLimitVoucher(user.id)

  const parsed = validateFormData(formData, submitVoucherFormSchema)
  if (!parsed.success) {
    redirect('/parent/payments?error=' + encodeURIComponent(parsed.error))
  }

  const d = parsed.data
  const base = {
    family_id: familyId,
    player_id: d.player_id,
    submission_method: 'form' as const,
    amount_cents: 10000, // Always $100 per voucher record
    status: 'submitted' as const,
    submitted_by: user.id,
    submitted_at: new Date().toISOString(),
    // Form data
    child_first_name: d.child_first_name,
    child_surname: d.child_surname,
    child_gender: d.child_gender,
    child_dob: d.child_dob,
    street_address: d.street_address,
    suburb: d.suburb,
    postcode: d.postcode,
    medicare_number: d.medicare_number || null,
    visa_number: d.visa_number || null,
    parent_first_name: d.parent_first_name,
    parent_surname: d.parent_surname,
    parent_contact_number: d.parent_contact_number,
    parent_email: d.parent_email,
    first_time: d.first_time === 'Yes',
    has_disability: d.has_disability === 'Yes',
    is_indigenous: d.is_indigenous === 'Yes',
    english_main_language: d.english_main_language === 'Yes',
    other_language: d.other_language || null,
    activity_cost: d.activity_cost,
  }

  const voucherIds = await createVoucherRecords(supabase, base, d.amount)

  // Notify admins (in-app + push)
  const { data: family } = await supabase.from('families').select('family_name').eq('id', familyId).single()
  const { data: player } = await supabase.from('players').select('first_name').eq('id', d.player_id).single()
  await notifyAdmins({
    type: 'voucher_received',
    title: 'Sports Voucher Submitted',
    body: `${family?.family_name ?? 'A family'} submitted a sports voucher for ${player?.first_name ?? 'a player'}`,
    url: '/admin/vouchers',
  }, user.id).catch(() => {})

  // Render and persist a PDF copy of the form submission for parent + admin record
  try {
    const { renderFormSubmissionPdf } = await import('@/lib/utils/voucher-pdf')
    const { uploadVoucherFormPdf } = await import('@/lib/utils/storage')
    const pdfBytes = await renderFormSubmissionPdf({
      childFirstName: d.child_first_name,
      childSurname: d.child_surname,
      childGender: d.child_gender,
      childDob: d.child_dob,
      streetAddress: d.street_address,
      suburb: d.suburb,
      postcode: d.postcode,
      medicareNumber: d.medicare_number ?? null,
      visaNumber: d.visa_number ?? null,
      parentFirstName: d.parent_first_name,
      parentSurname: d.parent_surname,
      parentContactNumber: d.parent_contact_number,
      parentEmail: d.parent_email,
      firstTime: d.first_time,
      hasDisability: d.has_disability,
      isIndigenous: d.is_indigenous,
      englishMainLanguage: d.english_main_language,
      otherLanguage: d.other_language ?? null,
      activityCost: d.activity_cost,
      submittedAt: base.submitted_at,
      familyName: family?.family_name ?? null,
    })
    const upload = await uploadVoucherFormPdf(supabase, pdfBytes, familyId, voucherIds[0])
    if (!('error' in upload)) {
      await supabase.from('vouchers').update({ form_pdf_path: upload.path }).in('id', voucherIds)
    }
  } catch (pdfErr) {
    console.error('Voucher PDF render failed:', pdfErr instanceof Error ? pdfErr.message : 'Unknown')
  }

  revalidatePath('/parent/payments')
  redirect('/parent/payments?success=' + encodeURIComponent(
    d.amount === '200'
      ? 'Two sports vouchers submitted for review'
      : 'Sports voucher submitted for review',
  ))
}

export async function submitVoucherImage(formData: FormData) {
  const { supabase, user, familyId } = await getParentFamily()
  await rateLimitVoucher(user.id)

  const parsed = validateFormData(formData, submitVoucherImageSchema)
  if (!parsed.success) {
    redirect('/parent/payments?error=' + encodeURIComponent(parsed.error))
  }

  const file = formData.get('voucher_file')
  if (!file || !(file instanceof File) || file.size === 0) {
    redirect('/parent/payments?error=' + encodeURIComponent('Please select a file to upload'))
  }

  const d = parsed.data
  const base = {
    family_id: familyId,
    player_id: d.player_id,
    submission_method: 'image' as const,
    amount_cents: 10000,
    status: 'submitted' as const,
    submitted_by: user.id,
    submitted_at: new Date().toISOString(),
  }

  const voucherIds = await createVoucherRecords(supabase, base, d.amount)

  // Upload file for the first voucher (both linked vouchers reference the same file)
  const uploadResult = await uploadVoucherFile(supabase, file, familyId, voucherIds[0])
  if ('error' in uploadResult) {
    redirect('/parent/payments?error=' + encodeURIComponent(uploadResult.error))
  }

  // Update all voucher records with the file path
  await supabase
    .from('vouchers')
    .update({ file_path: uploadResult.path })
    .in('id', voucherIds)

  // Notify admins (in-app + push)
  const { data: family } = await supabase.from('families').select('family_name').eq('id', familyId).single()
  const { data: player } = await supabase.from('players').select('first_name').eq('id', d.player_id).single()
  await notifyAdmins({
    type: 'voucher_received',
    title: 'Sports Voucher Uploaded',
    body: `${family?.family_name ?? 'A family'} uploaded a voucher form for ${player?.first_name ?? 'a player'}`,
    url: '/admin/vouchers',
  }, user.id).catch(() => {})

  revalidatePath('/parent/payments')
  redirect('/parent/payments?success=' + encodeURIComponent('Voucher form uploaded for review'))
}
