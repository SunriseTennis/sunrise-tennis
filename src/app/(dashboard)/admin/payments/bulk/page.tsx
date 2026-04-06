import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CheckCircle, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BulkPaymentForm } from './bulk-payment-form'

export default async function BulkPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const supabase = await createClient()

  const { data: families } = await supabase
    .from('families')
    .select('id, display_id, family_name, family_balance(balance_cents, confirmed_balance_cents)')
    .eq('status', 'active')
    .order('family_name')

  const familyList = (families ?? []).map(f => {
    const bal = f.family_balance as unknown as { balance_cents: number; confirmed_balance_cents: number } | null
    return {
      id: f.id,
      displayId: f.display_id,
      familyName: f.family_name,
      balanceCents: bal?.confirmed_balance_cents ?? bal?.balance_cents ?? 0,
    }
  })

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative">
          <Link href="/admin/payments" className="mb-2 inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
            <ChevronLeft className="size-3" /> Back to Payments
          </Link>
          <h1 className="text-2xl font-bold">Bulk Record Payments</h1>
          <p className="mt-0.5 text-sm text-white/70">Process a batch of bank transfers or cash payments</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          <CheckCircle className="size-4 shrink-0" />
          {success}
        </div>
      )}

      <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <BulkPaymentForm families={familyList} />
      </div>
    </div>
  )
}
