import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type Supabase = SupabaseClient<Database>

// ── Balance ─────────────────────────────────────────────────────────────

/**
 * Recalculate a family's balance from the ground truth (payments + charges).
 * Calls the Postgres function which atomically computes:
 *   balance = SUM(received payments) - SUM(active charges)
 * Returns the new balance in cents.
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

// ── Charges ─────────────────────────────────────────────────────────────

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
