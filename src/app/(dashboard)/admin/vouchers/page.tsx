import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { VoucherTabs } from './voucher-tabs'

export default async function AdminVouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireAdmin()
  const supabase = await createClient()
  const params = await searchParams

  // Fetch all data in parallel
  const [vouchersRes, batchesRes] = await Promise.all([
    supabase
      .from('vouchers')
      .select('id, family_id, player_id, amount_cents, status, submitted_at, reviewed_at, submission_method, file_path, form_pdf_path, batch_id, voucher_number, linked_voucher_id, child_first_name, child_surname, child_gender, child_dob, street_address, suburb, postcode, visa_number, medicare_number, parent_first_name, parent_surname, parent_contact_number, parent_email, first_time, has_disability, is_indigenous, english_main_language, other_language, activity_cost, rejection_reason, notes')
      .order('submitted_at', { ascending: false })
      .limit(200),
    supabase
      .from('voucher_batches')
      .select('id, batch_number, status, submitted_at, processed_at, csv_file_path, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const vouchers = vouchersRes.data ?? []
  const batches = batchesRes.data ?? []

  // Get family names
  const familyIds = [...new Set(vouchers.map(v => v.family_id))]
  let familyNames: Record<string, string> = {}
  if (familyIds.length > 0) {
    const { data: families } = await supabase
      .from('families')
      .select('id, family_name')
      .in('id', familyIds)
    if (families) {
      familyNames = Object.fromEntries(families.map(f => [f.id, f.family_name]))
    }
  }

  // Count vouchers per batch
  const batchVoucherCounts: Record<string, number> = {}
  for (const v of vouchers) {
    if (v.batch_id) {
      batchVoucherCounts[v.batch_id] = (batchVoucherCounts[v.batch_id] ?? 0) + 1
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title="Sports Vouchers" />
      <VoucherTabs
        vouchers={vouchers}
        batches={batches}
        familyNames={familyNames}
        batchVoucherCounts={batchVoucherCounts}
        initialTab={params.tab ?? 'pending'}
      />
    </div>
  )
}
