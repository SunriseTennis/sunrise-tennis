import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type Supabase = SupabaseClient<Database>

/**
 * Auto-applies a family's available credit at booking / enrolment time
 * (Decision: auto, allocation-only — 05-May-2026, plan 22 follow-up to
 * the BalanceHero rewrite).
 *
 * "Available credit" = `payments.amount_cents − SUM(allocations against
 * non-voided charges)`. Voided-charge allocations free up surplus because
 * the charge no longer counts in `recalculate_family_balance`'s active sum.
 *
 * No new `payments` row, no new `payment_method` enum value: credit is
 * just additional `payment_allocations` rows linking pre-existing payments
 * to the newly-created per-session charges.
 *
 * Race-safety note: two siblings enrolling simultaneously could each see
 * the same credit and double-allocate. With Personal-tier OP and a
 * single-family workflow this is rare; if it surfaces in the wild, wrap
 * the surplus query + allocation insert in an advisory lock keyed on
 * family_id.
 */

export interface ChargeForCredit {
  chargeId: string
  amountCents: number
}

export interface NewPaymentForAllocation {
  /** payment.id of the just-completed Stripe payment (or any other source). */
  id: string
  /** Amount of that payment in cents — should equal Σ(charge.amountCents) − creditAppliedCents. */
  amountCents: number
}

export interface AllocateWithCreditArgs {
  supabase: Supabase
  familyId: string
  /** Newly-inserted per-session charges to allocate against, in order. */
  newCharges: ChargeForCredit[]
  /** The just-completed Stripe (or other) payment, or null for credit-only flows. */
  newPayment: NewPaymentForAllocation | null
  /** How much credit the modal told the parent it would apply. */
  creditAppliedCents: number
}

export interface AllocateWithCreditResult {
  stripeAllocatedCents: number
  creditAllocatedCents: number
  /** True when the credit pool was smaller than `creditAppliedCents` (race / drift). */
  creditShortfall: boolean
}

/**
 * Walk `newCharges` in order. For each charge, fill from the new Stripe payment
 * first (preserves Plan 14 targeted-first semantics), then from existing-payment
 * surplus (oldest payment first, FIFO-style). Insert all allocation rows in a
 * single batch. Caller is responsible for `recalculate_family_balance`.
 */
export async function allocateChargesWithCredit(
  args: AllocateWithCreditArgs,
): Promise<AllocateWithCreditResult> {
  const { supabase, familyId, newCharges, newPayment, creditAppliedCents } = args

  if (newCharges.length === 0) {
    return { stripeAllocatedCents: 0, creditAllocatedCents: 0, creditShortfall: false }
  }

  // Fetch all received payments + their existing allocations + the status of
  // the charge each allocation pins to. Voided-charge allocations don't
  // count against surplus (the charge doesn't appear in recalc's active sum).
  type PaymentRow = {
    id: string
    amount_cents: number
    created_at: string
    payment_allocations: Array<{
      amount_cents: number
      charges: { status: string } | null
    }> | null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentRows } = await (supabase as any)
    .from('payments')
    .select('id, amount_cents, created_at, payment_allocations(amount_cents, charges:charge_id(status))')
    .eq('family_id', familyId)
    .eq('status', 'received')
    .order('created_at', { ascending: true })

  const surplus = ((paymentRows ?? []) as PaymentRow[])
    .map(p => {
      const liveAllocated = (p.payment_allocations ?? [])
        .filter(a => (a.charges?.status ?? 'pending') !== 'voided')
        .reduce((s, a) => s + (a.amount_cents ?? 0), 0)
      return { id: p.id, surplus: p.amount_cents - liveAllocated }
    })
    .filter(p => p.surplus > 0)

  let stripeRemaining = newPayment?.amountCents ?? 0
  let creditRemaining = Math.min(
    creditAppliedCents,
    surplus.reduce((s, p) => s + p.surplus, 0),
  )
  const creditShortfall = creditRemaining < creditAppliedCents

  const allocations: Array<{ payment_id: string; charge_id: string; amount_cents: number }> = []

  for (const c of newCharges) {
    let chargeRemaining = c.amountCents

    // Source 1: the new Stripe payment (Plan 14 targeted-first).
    if (newPayment && stripeRemaining > 0 && chargeRemaining > 0) {
      const alloc = Math.min(stripeRemaining, chargeRemaining)
      allocations.push({ payment_id: newPayment.id, charge_id: c.chargeId, amount_cents: alloc })
      stripeRemaining -= alloc
      chargeRemaining -= alloc
    }

    // Source 2: existing-payment surplus (FIFO, oldest first).
    while (chargeRemaining > 0 && creditRemaining > 0 && surplus.length > 0) {
      const cp = surplus[0]
      const alloc = Math.min(chargeRemaining, cp.surplus, creditRemaining)
      if (alloc <= 0) { surplus.shift(); continue }
      allocations.push({ payment_id: cp.id, charge_id: c.chargeId, amount_cents: alloc })
      cp.surplus -= alloc
      chargeRemaining -= alloc
      creditRemaining -= alloc
      if (cp.surplus <= 0) surplus.shift()
    }
  }

  if (allocations.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('payment_allocations')
      .insert(allocations)
    if (error) throw new Error(`Allocation insert failed: ${error.message}`)
  }

  const stripeAllocatedCents = (newPayment?.amountCents ?? 0) - stripeRemaining
  const creditAllocatedCents = allocations
    .filter(a => a.payment_id !== newPayment?.id)
    .reduce((s, a) => s + a.amount_cents, 0)

  return {
    stripeAllocatedCents,
    creditAllocatedCents,
    creditShortfall,
  }
}

/**
 * Read the family's current spendable credit (cents). Equals projected
 * balance when positive — this is the same number the BalanceHero
 * headline uses, so the UX never surfaces a credit number that the
 * allocation step can't actually back.
 */
export async function getAvailableCreditCents(
  supabase: Supabase,
  familyId: string,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('family_balance')
    .select('projected_balance_cents')
    .eq('family_id', familyId)
    .single()
  return Math.max(0, data?.projected_balance_cents ?? 0)
}
