import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { EmptyState } from '@/components/empty-state'
import { CreditCard } from 'lucide-react'
import { PaymentOptions } from './payment-options'
import { ChargesList } from './charges-list'
import { VoucherForm, VoucherHistory } from './voucher-form'
import { BalanceHero } from './balance-hero'
import { PaymentHistory } from './payment-history'

export default async function ParentPaymentsPage() {
  const supabase = await createClient()

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  const familyId = userRole?.family_id
  if (!familyId) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={CreditCard}
          title="No family account linked"
          description="This is how parents see their payment history."
        />
      </div>
    )
  }

  const [balanceRes, paymentsRes, chargesRes, vouchersRes, playersRes, familyRes] = await Promise.all([
    supabase.from('family_balance').select('balance_cents, confirmed_balance_cents, projected_balance_cents').eq('family_id', familyId).single(),
    supabase.from('payments').select('*, payment_allocations(amount_cents, charge_id, charges:charge_id(description, session_id, sessions:session_id(date, status)))').eq('family_id', familyId).neq('status', 'voided').order('created_at', { ascending: false }).limit(100),
    supabase.from('charges').select('id, type, source_type, description, amount_cents, status, program_id, session_id, player_id, created_at, sessions:session_id(date, status), players:player_id(first_name)').eq('family_id', familyId).in('status', ['pending', 'confirmed']).order('created_at', { ascending: false }).limit(100),
    supabase.from('vouchers').select('id, child_first_name, child_surname, amount_cents, status, submitted_at, rejection_reason, voucher_number, submission_method').eq('family_id', familyId).order('submitted_at', { ascending: false }).limit(20),
    supabase.from('players').select('id, first_name, last_name, dob').eq('family_id', familyId).eq('status', 'active').order('first_name'),
    supabase.from('families').select('primary_contact, address').eq('id', familyId).single(),
  ])

  const balance = balanceRes.data
  const payments = paymentsRes.data
  const charges = chargesRes.data
  const vouchers = vouchersRes.data
  const players = playersRes.data ?? []
  const familyData = familyRes.data
  const familyContact = familyData?.primary_contact as { name?: string; phone?: string; email?: string } | null
  const familyAddress = familyData?.address as string | null

  // Enrich charges with program names + types
  const programIds = [...new Set((charges ?? []).filter(c => c.program_id).map(c => c.program_id!))]
  let programInfo: Record<string, { name: string; type: string }> = {}
  if (programIds.length > 0) {
    const { data: programs } = await supabase
      .from('programs')
      .select('id, name, type')
      .in('id', programIds)
    if (programs) {
      programInfo = Object.fromEntries(programs.map(p => [p.id, { name: p.name, type: p.type }]))
    }
  }
  const enrichedCharges = (charges ?? []).map(c => {
    const session = c.sessions as unknown as { date: string; status: string } | null
    const player = c.players as unknown as { first_name: string } | null
    const info = c.program_id ? programInfo[c.program_id] : null
    return {
      id: c.id,
      type: c.type,
      source_type: c.source_type,
      description: c.description,
      amount_cents: c.amount_cents,
      status: c.status,
      program_id: c.program_id,
      session_id: c.session_id,
      player_id: c.player_id,
      created_at: c.created_at,
      program_name: info?.name ?? null,
      program_type: info?.type ?? null,
      player_name: player?.first_name ?? null,
      session_date: session?.date ?? null,
      session_status: session?.status ?? null,
    }
  })

  const confirmedBalanceCents = balance?.confirmed_balance_cents ?? 0
  const projectedBalanceCents = balance?.projected_balance_cents ?? 0
  const hasOutstandingBalance = confirmedBalanceCents < 0 || projectedBalanceCents < 0

  // Build payment data with allocations for the history component
  const paymentRows = (payments ?? []).map((payment) => {
    const allocations = (payment.payment_allocations ?? []) as unknown as {
      amount_cents: number
      charge_id: string
      charges: { description: string; session_id: string | null; sessions: { date: string; status: string } | null } | null
    }[]
    return {
      id: payment.id,
      date: payment.created_at ?? '',
      description: payment.description || payment.category || '-',
      method: payment.payment_method,
      amountCents: payment.amount_cents,
      status: payment.status,
      allocations: allocations.map(a => ({
        amountCents: a.amount_cents,
        chargeDescription: a.charges?.description ?? 'Unknown charge',
        sessionDate: a.charges?.sessions?.date ?? null,
        sessionStatus: a.charges?.sessions?.status ?? null,
      })),
    }
  })

  return (
    <div className="space-y-6">
      {/* ── Balance Hero ── */}
      <BalanceHero
        confirmedBalanceCents={confirmedBalanceCents}
        projectedBalanceCents={projectedBalanceCents}
      />

      {/* ── Make a Payment ── */}
      {hasOutstandingBalance && (
        <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <PaymentOptions
            familyId={familyId}
            balanceCents={projectedBalanceCents}
            outstandingInvoices={[]}
          />
        </section>
      )}

      {/* ── Current Charges ── */}
      {enrichedCharges.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
          <ChargesList charges={enrichedCharges} />
        </section>
      )}

      {/* ── Sports Voucher ── */}
      <section className="animate-fade-up" style={{ animationDelay: '220ms' }}>
        <VoucherForm
          players={players}
          familyContact={familyContact}
          familyAddress={familyAddress}
        />
        {vouchers && <VoucherHistory vouchers={vouchers} />}
      </section>

      {/* ── Payment History ── */}
      <section className="animate-fade-up" style={{ animationDelay: '300ms' }}>
        <PaymentHistory payments={paymentRows} />
      </section>
    </div>
  )
}
