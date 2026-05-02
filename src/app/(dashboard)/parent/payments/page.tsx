import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { EmptyState } from '@/components/empty-state'
import { CreditCard } from 'lucide-react'
import { WarmToast } from '@/components/warm-toast'
import { PaymentOptions } from './payment-options'
import { ChargesList } from './charges-list'
import { VoucherForm, VoucherHistory } from './voucher-form'
import { BalanceHero } from './balance-hero'
import { PaymentHistory } from './payment-history'
import { PaymentProvider } from './payment-context'

export default async function ParentPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
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
    supabase.from('payments').select('*, payment_allocations(amount_cents, charge_id, charges:charge_id(description, session_id, sessions:session_id(date, status)))').eq('family_id', familyId).neq('status', 'voided').neq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('charges').select('id, type, source_type, description, amount_cents, status, program_id, session_id, player_id, created_at, sessions:session_id(date, status), players:player_id(first_name), payment_allocations(amount_cents)').eq('family_id', familyId).in('status', ['pending', 'confirmed', 'paid', 'credited']).order('created_at', { ascending: false }).limit(150),
    supabase.from('vouchers').select('id, child_first_name, child_surname, amount_cents, status, submitted_at, rejection_reason, voucher_number, submission_method').eq('family_id', familyId).order('submitted_at', { ascending: false }).limit(20),
    supabase.from('players').select('id, first_name, last_name, dob, gender').eq('family_id', familyId).eq('status', 'active').order('first_name'),
    supabase.from('families').select('primary_contact, address, family_name').eq('id', familyId).single(),
  ])

  const balance = balanceRes.data
  const payments = paymentsRes.data
  const charges = chargesRes.data
  const vouchers = vouchersRes.data
  const players = playersRes.data ?? []
  const familyData = familyRes.data
  const familyContact = familyData?.primary_contact as { name?: string; phone?: string; email?: string } | null
  const familyAddress = familyData?.address as string | null
  const familyName = familyData?.family_name ?? null

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
    const allocations = (c.payment_allocations ?? []) as unknown as { amount_cents: number }[]
    const paid_cents = allocations.reduce((sum, a) => sum + (a.amount_cents ?? 0), 0)
    // Positive charges: outstanding = amount - allocated. Negative (credits) pass through unchanged.
    const outstanding_cents = c.amount_cents > 0
      ? Math.max(0, c.amount_cents - paid_cents)
      : c.amount_cents
    return {
      id: c.id,
      type: c.type,
      source_type: c.source_type,
      description: c.description,
      amount_cents: c.amount_cents,
      paid_cents,
      outstanding_cents,
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
  const totalBalanceCents = balance?.balance_cents ?? 0

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
    <PaymentProvider>
      <div className="space-y-6">
        {error && (
          <WarmToast variant="danger">{decodeURIComponent(error)}</WarmToast>
        )}
        {success && (
          <WarmToast variant="success">{decodeURIComponent(success)}</WarmToast>
        )}

        {/* ── Balance Hero ── */}
        <BalanceHero confirmedBalanceCents={confirmedBalanceCents} />

        {/* ── Make a Payment / Pay Ahead ── */}
        <section id="payment-section" className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <PaymentOptions
            familyId={familyId}
            balanceCents={totalBalanceCents}
            familyName={familyName}
            outstandingInvoices={[]}
          />
        </section>

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

        <p className="pt-4 text-center text-xs text-muted-foreground">
          Payments are governed by our{' '}
          <a href="/terms#payments" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            Terms
          </a>
          .
        </p>
      </div>
    </PaymentProvider>
  )
}
