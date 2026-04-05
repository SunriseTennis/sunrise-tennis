'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { createCharge } from '@/lib/utils/billing'
import { sendPushToUser } from '@/lib/push/send'

// ── Helper: get parent user_id for a voucher's family ──

async function getParentUserIdForFamily(
  supabase: Awaited<ReturnType<typeof createClient>>,
  familyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('family_id', familyId)
    .eq('role', 'parent')
    .limit(1)
    .single()
  return data?.user_id ?? null
}

// ── Batch Management ──

export async function createBatch() {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('voucher_batches')
    .insert({ status: 'draft' })

  if (error) {
    console.error('Create batch failed:', error.message)
    redirect('/admin/vouchers?error=' + encodeURIComponent('Failed to create batch'))
  }

  revalidatePath('/admin/vouchers')
  redirect('/admin/vouchers?tab=batches')
}

export async function addToBatch(voucherId: string, batchId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('vouchers')
    .update({ batch_id: batchId, status: 'in_batch' })
    .eq('id', voucherId)
    .in('status', ['submitted'])

  if (error) {
    console.error('Add to batch failed:', error.message)
  }

  revalidatePath('/admin/vouchers')
}

export async function removeFromBatch(voucherId: string) {
  await requireAdmin()
  const supabase = await createClient()

  await supabase
    .from('vouchers')
    .update({ batch_id: null, status: 'submitted' })
    .eq('id', voucherId)

  revalidatePath('/admin/vouchers')
}

export async function markBatchSubmitted(batchId: string) {
  const user = await requireAdmin()
  const supabase = await createClient()

  // Update batch status
  await supabase
    .from('voucher_batches')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: user.id,
    })
    .eq('id', batchId)

  // Update all vouchers in this batch
  const { data: vouchers } = await supabase
    .from('vouchers')
    .select('id, family_id, child_first_name, player_id')
    .eq('batch_id', batchId)

  if (vouchers) {
    await supabase
      .from('vouchers')
      .update({
        status: 'submitted_to_portal',
        portal_submitted_at: new Date().toISOString(),
        portal_submitted_by: user.id,
      })
      .eq('batch_id', batchId)

    // Notify each family
    const notifiedFamilies = new Set<string>()
    for (const v of vouchers) {
      if (notifiedFamilies.has(v.family_id)) continue
      notifiedFamilies.add(v.family_id)

      const parentUserId = await getParentUserIdForFamily(supabase, v.family_id)
      if (parentUserId) {
        await sendPushToUser(parentUserId, {
          title: 'Voucher Submitted to SA',
          body: `Your sports voucher for ${v.child_first_name ?? 'your child'} has been submitted to Sports Vouchers SA`,
          url: '/parent/payments',
        }).catch(() => {})
      }
    }
  }

  revalidatePath('/admin/vouchers')
  redirect('/admin/vouchers?tab=batches')
}

// ── CSV Generation ──

const CSV_HEADERS = [
  'Child first name',
  'Child surname',
  'Child gender',
  'Child date of birth',
  'Street Address',
  'Suburb',
  'Postcode',
  'Australian Visa Number',
  'Medicare number',
  'Parent first name',
  'Parent surname',
  'Parent contact number',
  'Parent email',
  'First time joining this organisation?',
  'Identified as living with a disability?',
  'Aboriginal or Torres Strait Islander?',
  'Is English the main language spoken at home?',
  'If no, what language do you speak at home?',
  'Cost to register for this activity',
]

function escCsv(val: string | null | undefined): string {
  const s = val ?? ''
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function downloadBatchCsv(batchId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: vouchers } = await supabase
    .from('vouchers')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at')

  if (!vouchers || vouchers.length === 0) {
    redirect('/admin/vouchers?error=' + encodeURIComponent('No vouchers in this batch'))
  }

  const rows = vouchers.map((v) => [
    escCsv(v.child_first_name),
    escCsv(v.child_surname),
    escCsv(v.child_gender),
    escCsv(v.child_dob),
    escCsv(v.street_address),
    escCsv(v.suburb),
    escCsv(v.postcode),
    escCsv(v.visa_number),
    escCsv(v.medicare_number),
    escCsv(v.parent_first_name),
    escCsv(v.parent_surname),
    escCsv(v.parent_contact_number),
    escCsv(v.parent_email),
    v.first_time ? 'Yes' : 'No',
    v.has_disability ? 'Yes' : 'No',
    v.is_indigenous ? 'Yes' : 'No',
    v.english_main_language ? 'Yes' : 'No',
    escCsv(v.other_language),
    escCsv(v.activity_cost),
  ].join(','))

  const csv = [CSV_HEADERS.join(','), ...rows].join('\n')

  // Return the CSV content — the client component will trigger download
  return csv
}

// ── Voucher Review ──

export async function rejectVoucher(voucherId: string, formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()
  const reason = (formData.get('reason') as string)?.trim() || 'No reason provided'

  const { data: voucher } = await supabase
    .from('vouchers')
    .select('id, status, family_id, child_first_name')
    .eq('id', voucherId)
    .single()

  if (!voucher || voucher.status === 'approved') {
    redirect('/admin/vouchers?error=' + encodeURIComponent('Cannot reject this voucher'))
  }

  await supabase
    .from('vouchers')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      rejection_reason: reason,
    })
    .eq('id', voucherId)

  // Notify parent
  const parentUserId = await getParentUserIdForFamily(supabase, voucher.family_id)
  if (parentUserId) {
    await sendPushToUser(parentUserId, {
      title: 'Voucher Declined',
      body: `Your sports voucher for ${voucher.child_first_name ?? 'your child'} was declined. Reason: ${reason}`,
      url: '/parent/payments',
    }).catch(() => {})
  }

  revalidatePath('/admin/vouchers')
  redirect('/admin/vouchers')
}

// ── Approve (money received) ──

export async function approveVouchers(voucherIds: string[]) {
  const user = await requireAdmin()
  const supabase = await createClient()

  for (const voucherId of voucherIds) {
    const { data: voucher } = await supabase
      .from('vouchers')
      .select('id, family_id, amount_cents, status, child_first_name')
      .eq('id', voucherId)
      .single()

    if (!voucher || voucher.status === 'approved') continue

    // Create credit charge
    const { chargeId } = await createCharge(supabase, {
      familyId: voucher.family_id,
      type: 'voucher',
      sourceType: 'voucher',
      sourceId: voucherId,
      description: `Sports voucher credit - $${(voucher.amount_cents / 100).toFixed(0)}`,
      amountCents: -voucher.amount_cents,
      status: 'confirmed',
      createdBy: user.id,
    })

    await supabase
      .from('vouchers')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        charge_id: chargeId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', voucherId)

    // Notify parent
    const parentUserId = await getParentUserIdForFamily(supabase, voucher.family_id)
    if (parentUserId) {
      await sendPushToUser(parentUserId, {
        title: 'Voucher Approved',
        body: `$${(voucher.amount_cents / 100).toFixed(0)} has been credited to your account for ${voucher.child_first_name ?? 'your child'}'s sports voucher`,
        url: '/parent/payments',
      }).catch(() => {})
    }
  }

  revalidatePath('/admin/vouchers')
  revalidatePath('/admin/payments')
  redirect('/admin/vouchers?tab=payments')
}

// ── Save AI-extracted data to a voucher ──

export async function saveExtractedData(voucherId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const fields: Record<string, unknown> = {}
  for (const key of [
    'child_first_name', 'child_surname', 'child_gender', 'child_dob',
    'street_address', 'suburb', 'postcode', 'visa_number', 'medicare_number',
    'parent_first_name', 'parent_surname', 'parent_contact_number', 'parent_email',
    'other_language', 'activity_cost',
  ]) {
    const val = (formData.get(key) as string)?.trim()
    if (val) fields[key] = val
  }

  // Boolean fields
  for (const key of ['first_time', 'has_disability', 'is_indigenous', 'english_main_language']) {
    const val = formData.get(key) as string
    if (val) fields[key] = val === 'Yes' || val === 'true'
  }

  await supabase.from('vouchers').update(fields).eq('id', voucherId)

  revalidatePath('/admin/vouchers')
}
