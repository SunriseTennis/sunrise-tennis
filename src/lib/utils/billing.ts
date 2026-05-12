import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type Supabase = SupabaseClient<Database>

// ── Balance ─────────────────────────────────────────────────────────────

/**
 * Recalculate a family's balance from the ground truth (payments + charges).
 * Calls the Postgres function which atomically computes:
 *   balance = SUM(received payments) - SUM(active charges)
 * Returns the new projected balance in cents.
 */
export async function recalculateBalance(
  supabase: Supabase,
  familyId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('recalculate_family_balance', {
    target_family_id: familyId,
  })

  if (error) {
    console.error('Failed to recalculate balance:', error.message)
    throw new Error('Balance recalculation failed')
  }

  return data as number
}

/**
 * Recalculate family_balance for every family with a charge on a given session.
 *
 * `confirmed_balance_cents` includes only charges linked to completed sessions
 * (or no session at all). When a session's status flips between `scheduled`
 * and `completed`, every charge attached to it moves in or out of the
 * confirmed set — so every family with a charge on the session needs a fresh
 * recalc. Without this, `family_balance.confirmed_balance_cents` goes stale
 * for those families until something else triggers a recalc on them.
 *
 * Call this AFTER any UPDATE that flips `sessions.status` between
 * `scheduled` and `completed`. Cancellation paths don't need it — they void
 * the charges through the existing billing helpers, which already recalc.
 *
 * Documented in `.claude/rules/debugging.md` "family_balance staleness".
 */
export async function recalcFamiliesForSession(
  supabase: Supabase,
  sessionId: string,
): Promise<void> {
  const { data: charges, error } = await supabase
    .from('charges')
    .select('family_id')
    .eq('session_id', sessionId)

  if (error) {
    console.error('recalcFamiliesForSession: failed to read charges', error.message)
    return
  }

  const familyIds = Array.from(new Set((charges ?? []).map(c => c.family_id).filter((id): id is string => !!id)))
  for (const fid of familyIds) {
    try {
      await recalculateBalance(supabase, fid)
    } catch (e) {
      console.error(`recalcFamiliesForSession: recalc failed for family ${fid}`, e)
    }
  }
}

/**
 * Get both confirmed and projected balances for a family.
 * - confirmed: payments minus charges for completed sessions + non-session charges
 * - projected: payments minus ALL active charges (includes future bookings)
 */
export async function getDualBalance(
  supabase: Supabase,
  familyId: string,
): Promise<{ confirmed: number; projected: number }> {
  const { data, error } = await supabase
    .from('family_balance')
    .select('confirmed_balance_cents, projected_balance_cents')
    .eq('family_id', familyId)
    .single()

  if (error) {
    console.error('Failed to get dual balance:', error.message)
    return { confirmed: 0, projected: 0 }
  }

  return {
    confirmed: data.confirmed_balance_cents,
    projected: data.projected_balance_cents,
  }
}

/**
 * Allocate a payment to charges using FIFO (oldest charges first).
 * Calls a Postgres function that atomically handles allocation.
 */
export async function allocatePayment(
  supabase: Supabase,
  paymentId: string,
): Promise<void> {
  const { error } = await supabase.rpc('allocate_payment_to_charges', {
    target_payment_id: paymentId,
  })

  if (error) {
    console.error('Failed to allocate payment:', error.message)
    // Non-fatal: allocation is a convenience feature, not a blocker
  }
}

/**
 * Void (soft-delete) an erroneous payment. Sets status to 'voided',
 * recalculates balance, and clears allocations.
 */
export async function voidPayment(
  supabase: Supabase,
  paymentId: string,
  familyId: string,
  userId: string,
): Promise<number> {
  const { error } = await supabase
    .from('payments')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: userId,
    })
    .eq('id', paymentId)

  if (error) {
    console.error('Failed to void payment:', error.message)
    throw new Error('Payment void failed')
  }

  // Clear allocations for this payment
  await supabase
    .from('payment_allocations')
    .delete()
    .eq('payment_id', paymentId)

  return recalculateBalance(supabase, familyId)
}

/**
 * Waive a charge (void it with a waiver note). Recalculates balance.
 */
export async function waiveCharge(
  supabase: Supabase,
  chargeId: string,
  familyId: string,
  reason?: string,
): Promise<number> {
  const { error } = await supabase
    .from('charges')
    .update({
      status: 'voided',
      description: reason
        ? `[WAIVED] ${reason}`
        : '[WAIVED]',
    })
    .eq('id', chargeId)

  if (error) {
    console.error('Failed to waive charge:', error.message)
    throw new Error('Charge waive failed')
  }

  return recalculateBalance(supabase, familyId)
}

// ── Charge descriptions ────────────────────────────────────────────────

export interface ChargeDescriptionInput {
  /** Player first name, e.g. "Anya". Optional but recommended. */
  playerName?: string | null
  /** Program or session label, e.g. "Wed Red-Ball 4:15" or "Private w/ Zoe". */
  label?: string | null
  /** Suffix qualifier in parens after the label, e.g. "No Show", "Makeup", "50% charge". */
  suffix?: string | null
  /** Session/booking date — used when no term label applies (e.g. privates). */
  date?: Date | string | null
  /** Term label, e.g. "Term 2 2026". Preferred over date for group sessions. */
  term?: string | null
}

/**
 * Canonical charge description format — `<Player> - <Label[(suffix)]> - <Term or Date>`.
 * Example outputs:
 *   "Anya - Wed Red-Ball 4:15 - Term 2 2026"
 *   "Anya - Wed Red-Ball 4:15 (No Show) - Term 2 2026"
 *   "Anya - Private w/ Zoe - 03 May 2026"
 *
 * Use this at every charge creation site so the parent payments list is
 * uniformly readable (action-plan 3b). See .claude/rules/financial-accuracy.md.
 */
export function formatChargeDescription(input: ChargeDescriptionInput): string {
  const parts: string[] = []
  if (input.playerName) parts.push(input.playerName)

  let middle = ''
  if (input.label) middle = input.label
  if (input.suffix) middle = middle ? `${middle} (${input.suffix})` : input.suffix
  if (middle) parts.push(middle)

  if (input.term) parts.push(input.term)
  else if (input.date) {
    const d = typeof input.date === 'string' ? new Date(input.date) : input.date
    if (!isNaN(d.getTime())) {
      parts.push(d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }))
    }
  }

  return parts.filter(Boolean).join(' - ') || 'Charge'
}

// ── Charges ─────────────────────────────────────────────────────────────

export interface PricingBreakdown {
  /** Number of sessions covered by this charge (term enrol). 1 for single-session. */
  sessions?: number
  /** Per-session base price in cents (after family override + morning-squad partner, before multi-group/early-bird). */
  per_session_cents?: number
  /** sessions × per_session_cents — pre-discount subtotal in cents. */
  subtotal_cents?: number
  /** True when the morning-squad cross-day partner rate ($15) replaced the base price. */
  morning_squad_partner_applied?: boolean
  /** Multi-group discount percent (typically 25). Omitted when not applied. */
  multi_group_pct?: number
  /** Multi-group discount in cents (positive number — amount saved). */
  multi_group_cents_off?: number
  /** Friendly label for the multi-group line, e.g. "Multi-group (25% off the 2nd group, per child)". */
  multi_group_label?: string
  /** Early-bird percent (e.g. 10 or 15). Omitted when not applied. */
  early_bird_pct?: number
  /** Early-bird discount in cents (positive number — amount saved). */
  early_bird_cents_off?: number
  /** Friendly label for the early-bird line, e.g. "Early Bird Special". */
  early_bird_label?: string
  /** Which early-bird tier was active when the charge was billed. */
  early_bird_tier?: 1 | 2
  /** ISO date the active tier ends (used by PricingBreakdownPanel to show "ends DD-MMM"). */
  early_bird_deadline?: string
  /** Tier-2 percent — only set when tier-1 is currently active and tier-2 is configured. */
  tier2_pct?: number
  /** Tier-2 deadline. */
  tier2_deadline?: string
  /** Final amount in cents — should equal amount_cents on the row. */
  total_cents: number
  // ── Adjustment-charge variant (Phase D) ───────────────────────────────────
  /** When set, identifies the original (paid) charge that this adjustment reverses. */
  adjustment_for_charge_id?: string
  /** Reason this adjustment was created. Drives the explanation copy in PricingBreakdownPanel. */
  adjustment_reason?: 'multi_group_no_longer_eligible' | 'morning_squad_partner_lost'
  /** Snapshot of the original charge's description (so the panel can name what was adjusted). */
  original_charge_description?: string
  /** Cents of multi-group discount that's being clawed back (informational). */
  surrendered_multi_group_cents_off?: number
  /** Early-bird percent that stays applied to the surviving charge (informational). */
  residual_early_bird_pct?: number
}

export interface CreateChargeParams {
  familyId: string
  playerId?: string | null
  type: string
  sourceType: string
  sourceId?: string | null
  sessionId?: string | null
  programId?: string | null
  bookingId?: string | null
  description: string
  amountCents: number
  status?: string
  invoiceId?: string | null
  createdBy?: string | null
  pricingBreakdown?: PricingBreakdown | null
}

/**
 * Create a charge row and recalculate the family balance.
 * Returns the new charge id and updated balance.
 */
export async function createCharge(
  supabase: Supabase,
  params: CreateChargeParams,
): Promise<{ chargeId: string; balance: number }> {
  const { data, error } = await supabase
    .from('charges')
    .insert({
      family_id: params.familyId,
      player_id: params.playerId || null,
      type: params.type,
      source_type: params.sourceType,
      source_id: params.sourceId || null,
      session_id: params.sessionId || null,
      program_id: params.programId || null,
      booking_id: params.bookingId || null,
      description: params.description,
      amount_cents: params.amountCents,
      status: params.status || 'pending',
      invoice_id: params.invoiceId || null,
      created_by: params.createdBy || null,
      pricing_breakdown: (params.pricingBreakdown ?? null) as never,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create charge:', error.message)
    throw new Error('Charge creation failed')
  }

  const balance = await recalculateBalance(supabase, params.familyId)
  return { chargeId: data.id, balance }
}

/**
 * Void a charge (set status to 'voided') and recalculate balance.
 * Returns the updated balance.
 */
export async function voidCharge(
  supabase: Supabase,
  chargeId: string,
  familyId: string,
): Promise<number> {
  const { error } = await supabase
    .from('charges')
    .update({ status: 'voided' })
    .eq('id', chargeId)

  if (error) {
    console.error('Failed to void charge:', error.message)
    throw new Error('Charge void failed')
  }

  return recalculateBalance(supabase, familyId)
}

// ── Pricing ─────────────────────────────────────────────────────────────

/**
 * Get the per-session price for a family+program, resolving overrides.
 * Resolution: family_pricing (specific program) > family_pricing (type) > program default.
 */
export async function getSessionPrice(
  supabase: Supabase,
  familyId: string,
  programId: string,
  programType?: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc('get_session_price', {
    target_family_id: familyId,
    target_program_id: programId,
    target_program_type: programType || undefined,
  })

  if (error) {
    console.error('Failed to get session price:', error.message)
    return 0
  }

  return (data as number) ?? 0
}

/**
 * Get the term fee for a family+program, resolving overrides.
 */
export async function getTermPrice(
  supabase: Supabase,
  familyId: string,
  programId: string,
  programType?: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc('get_term_price', {
    target_family_id: familyId,
    target_program_id: programId,
    target_program_type: programType || undefined,
  })

  if (error) {
    console.error('Failed to get term price:', error.message)
    return 0
  }

  return (data as number) ?? 0
}

// ── Attendance billing helpers ──────────────────────────────────────────

/**
 * Count unexcused absences for a player in a program this term.
 * Used to enforce the absence credit policy:
 *   - Groups: first 2 unexcused per term get credit, 3rd+ fully charged
 *   - Privates: 1st unexcused = 50% credit, 2nd+ = no credit
 */
export async function getUnexcusedAbsenceCount(
  supabase: Supabase,
  playerId: string,
  programId: string,
): Promise<number> {
  // Count charges created from attendance where the player was absent (unexcused)
  // These are identified by source_type='attendance' and type='session'
  // for sessions where the attendance status was 'absent'
  const { count, error } = await supabase
    .from('charges')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('program_id', programId)
    .eq('source_type', 'attendance')
    .eq('type', 'session')
    .eq('status', 'confirmed')

  if (error) {
    console.error('Failed to count unexcused absences:', error.message)
    return 0
  }

  return count ?? 0
}

/**
 * Check if a charge already exists for a specific session+player combo.
 * Prevents duplicate charges on re-marking attendance.
 */
export async function getExistingSessionCharge(
  supabase: Supabase,
  sessionId: string,
  playerId: string,
): Promise<{ id: string; amount_cents: number; status: string } | null> {
  const { data } = await supabase
    .from('charges')
    .select('id, amount_cents, status')
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .in('status', ['pending', 'confirmed'])
    .single()

  return data
}

// ── Coach Pay ──────────────────────────────────────────────────────────

/**
 * Calculate group session coach pay based on hourly rate and session duration.
 * Returns pay in cents.
 */
export function calculateGroupCoachPay(groupRateCents: number, durationMin: number): number {
  return Math.round(groupRateCents * durationMin / 60)
}
