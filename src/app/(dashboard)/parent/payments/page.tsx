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
import { recomputePendingChargesForFamily, persistChargeRecompute } from '@/lib/utils/charge-recompute'

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
    supabase.from('payments').select('*, payment_allocations(amount_cents, charge_id, charges:charge_id(description, status, session_id, program_id, booking_id, pricing_breakdown, sessions:session_id(date, status)))').eq('family_id', familyId).neq('status', 'voided').neq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('charges').select('id, type, source_type, description, amount_cents, status, program_id, session_id, booking_id, player_id, created_at, pricing_breakdown, sessions:session_id(date, status), players:player_id(first_name), payment_allocations(amount_cents)').eq('family_id', familyId).in('status', ['pending', 'confirmed', 'paid', 'credited']).order('created_at', { ascending: false }).limit(150),
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

  // Enrich charges with program names + types. Also include programs referenced
  // only via payment allocations (paid charges past the current-charges window)
  // so PaymentHistory bundle headers can show the program name.
  const chargeProgramIds = (charges ?? []).filter(c => c.program_id).map(c => c.program_id!)
  const allocProgramIds = (payments ?? []).flatMap(p =>
    ((p.payment_allocations ?? []) as unknown as { charges: { program_id: string | null } | null }[])
      .map(a => a.charges?.program_id)
      .filter((id): id is string => !!id),
  )
  const programIds = [...new Set([...chargeProgramIds, ...allocProgramIds])]
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
  // Phase B — Live recompute for pending unpaid charges. The DB-stored
  // `pricing_breakdown` is frozen at charge-creation; the live one reflects
  // today's roster + today's early-bird tier. Cached per (player, program)
  // tuple inside the helper to avoid N+1 RPC calls.
  const liveBreakdowns = await recomputePendingChargesForFamily(supabase, familyId)

  // Phase C — Persist the live recompute to DB so the prefilled Pay amount,
  // the Stripe intent, and the FIFO webhook allocation all agree. Idempotent
  // (running twice writes the same values). Service client because parents
  // don't have UPDATE policy on charges. Quietly skip on failure (display
  // still renders correctly via liveBreakdowns; the only risk is a webhook
  // allocation against frozen amounts, which the next page load fixes).
  if (liveBreakdowns.size > 0) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const service = createServiceClient()
      const chargeIds = [...liveBreakdowns.keys()]
      await persistChargeRecompute(service, chargeIds, familyId, liveBreakdowns)
    } catch (e) {
      console.error('Phase C persist on page render failed:', e instanceof Error ? e.message : e)
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

    // For pending unpaid charges, override the displayed breakdown + amount
    // with today's live values. Past-paid charges keep their frozen state.
    const live = c.status === 'pending' && outstanding_cents > 0
      ? liveBreakdowns.get(c.id)
      : null
    const displayedBreakdown = live
      ? (live.breakdown as unknown as { total_cents: number })
      : ((c.pricing_breakdown as unknown as { total_cents: number } | null) ?? null)
    const displayedAmount = live ? live.amountCents : c.amount_cents
    const displayedOutstanding = live
      ? Math.max(0, live.amountCents - paid_cents)
      : outstanding_cents

    return {
      id: c.id,
      type: c.type,
      source_type: c.source_type,
      description: c.description,
      amount_cents: displayedAmount,
      paid_cents,
      outstanding_cents: displayedOutstanding,
      status: c.status,
      program_id: c.program_id,
      session_id: c.session_id,
      booking_id: c.booking_id,
      player_id: c.player_id,
      created_at: c.created_at,
      program_name: info?.name ?? null,
      program_type: info?.type ?? null,
      player_name: player?.first_name ?? null,
      session_date: session?.date ?? null,
      session_status: session?.status ?? null,
      pricing_breakdown: displayedBreakdown,
    }
  })

  const confirmedBalanceCents = balance?.confirmed_balance_cents ?? 0
  const projectedBalanceCents = balance?.projected_balance_cents ?? 0
  const totalBalanceCents = balance?.balance_cents ?? 0

  // "Prepaid for upcoming sessions" = sum of allocations attached to charges
  // whose session is still scheduled (future). This is the figure that today
  // shows up as misleading "Credit on account" when a parent has paid a term
  // up-front but no sessions have run yet.
  const prepaidUpcomingCents = (payments ?? []).reduce((sum, p) => {
    const allocations = (p.payment_allocations ?? []) as unknown as {
      amount_cents: number
      charges: { sessions: { status: string } | null } | null
    }[]
    return sum + allocations.reduce((s, a) => {
      const sess = a.charges?.sessions
      return s + (sess?.status === 'scheduled' ? (a.amount_cents ?? 0) : 0)
    }, 0)
  }, 0)

  // Build payment data with allocations for the history component.
  // Filter voided allocations: when a charge is later voided (e.g. parent
  // unenrols a pay-now program → its charges are voided to credit the family),
  // the allocation row stays but should NOT continue to claim "applied to: X".
  const paymentRows = (payments ?? []).map((payment) => {
    const allocations = (payment.payment_allocations ?? []) as unknown as {
      amount_cents: number
      charge_id: string
      charges: {
        description: string
        status: string
        session_id: string | null
        program_id: string | null
        booking_id: string | null
        pricing_breakdown: unknown | null
        sessions: { date: string; status: string } | null
      } | null
    }[]
    const visibleAllocations = allocations.filter(a => a.charges?.status !== 'voided')
    return {
      id: payment.id,
      date: payment.created_at ?? '',
      description: payment.description || payment.category || '-',
      method: payment.payment_method,
      amountCents: payment.amount_cents,
      status: payment.status,
      allocations: visibleAllocations.map(a => ({
        amountCents: a.amount_cents,
        chargeDescription: a.charges?.description ?? 'Unknown charge',
        sessionDate: a.charges?.sessions?.date ?? null,
        sessionStatus: a.charges?.sessions?.status ?? null,
        programId: a.charges?.program_id ?? null,
        bookingId: a.charges?.booking_id ?? null,
        programName: a.charges?.program_id ? programInfo[a.charges.program_id]?.name ?? null : null,
        pricingBreakdown: (a.charges?.pricing_breakdown as { total_cents: number; subtotal_cents?: number; multi_group_cents_off?: number; early_bird_cents_off?: number } | null) ?? null,
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
        <BalanceHero
          confirmedBalanceCents={confirmedBalanceCents}
          projectedBalanceCents={projectedBalanceCents}
          prepaidUpcomingCents={prepaidUpcomingCents}
        />

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
