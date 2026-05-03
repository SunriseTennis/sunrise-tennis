import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type Supabase = SupabaseClient<Database>

/**
 * Approximate usage stats for a discount type by scanning charges in a date
 * window for either the description suffix (legacy fallback) or the
 * pricing_breakdown JSON (preferred).
 *
 * Both paths are necessary because charges from before the breakdown column
 * landed (or from credit/private code paths that don't populate it) only
 * carry the suffix in their description text.
 */
export async function getMultiGroupUsage(
  supabase: Supabase,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ chargeCount: number; savedCents: number }> {
  // First-pass: charges with breakdown JSON.
  const { data: jsonRows } = await supabase
    .from('charges')
    .select('id, pricing_breakdown')
    .gte('created_at', rangeStart)
    .lte('created_at', rangeEnd)
    .not('pricing_breakdown', 'is', null)
    .neq('status', 'voided')

  let chargeCount = 0
  let savedCents = 0
  const countedIds = new Set<string>()
  for (const row of jsonRows ?? []) {
    const b = row.pricing_breakdown as { multi_group_cents_off?: number } | null
    if (b?.multi_group_cents_off && b.multi_group_cents_off > 0) {
      chargeCount += 1
      savedCents += b.multi_group_cents_off
      countedIds.add(row.id)
    }
  }

  // Second-pass: legacy charges with the suffix in description (de-duped).
  const { data: descRows } = await supabase
    .from('charges')
    .select('id, description, amount_cents')
    .gte('created_at', rangeStart)
    .lte('created_at', rangeEnd)
    .ilike('description', '%multi-group%')
    .neq('status', 'voided')

  for (const row of descRows ?? []) {
    if (countedIds.has(row.id)) continue
    chargeCount += 1
    // Approximate saving: 25% of the implied gross = amount × 25/75.
    if (row.amount_cents > 0) {
      savedCents += Math.round((row.amount_cents * 25) / 75)
    }
  }

  return { chargeCount, savedCents }
}

export async function getEarlyBirdUsage(
  supabase: Supabase,
  programId: string | null,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ chargeCount: number; savedCents: number }> {
  let q = supabase
    .from('charges')
    .select('id, pricing_breakdown, description, amount_cents, program_id')
    .gte('created_at', rangeStart)
    .lte('created_at', rangeEnd)
    .neq('status', 'voided')

  if (programId) q = q.eq('program_id', programId)

  const { data } = await q

  let chargeCount = 0
  let savedCents = 0
  for (const row of data ?? []) {
    const b = row.pricing_breakdown as { early_bird_cents_off?: number; early_bird_pct?: number } | null
    if (b?.early_bird_cents_off && b.early_bird_cents_off > 0) {
      chargeCount += 1
      savedCents += b.early_bird_cents_off
      continue
    }
    // Legacy fallback via description suffix (e.g. "10% early-pay")
    const m = row.description?.match(/(\d+)% early-pay/i)
    if (m) {
      const pct = parseInt(m[1], 10)
      if (pct > 0 && row.amount_cents > 0) {
        chargeCount += 1
        // Implied gross = amount × 100/(100−pct); savings = gross × pct/100
        const implied = (row.amount_cents * 100) / (100 - pct)
        savedCents += Math.round(implied * (pct / 100))
      }
    }
  }
  return { chargeCount, savedCents }
}

/**
 * Per-row usage breakdown for a single family_pricing override. Returns the
 * list of charges that landed under this override during its valid window,
 * with the per-row savings vs the standard rate (best-effort).
 */
export async function getFamilyPricingUsage(
  supabase: Supabase,
  pricingId: string,
): Promise<{
  charges: { id: string; description: string; createdAt: string | null; amountCents: number }[]
  totalAmountCents: number
}> {
  // Lookup the override row to get family + valid window
  const { data: row } = await supabase
    .from('family_pricing')
    .select('family_id, valid_from, valid_until, program_type, coach_id')
    .eq('id', pricingId)
    .single()

  if (!row) return { charges: [], totalAmountCents: 0 }

  const startISO = row.valid_from ? `${row.valid_from}T00:00:00Z` : '1970-01-01T00:00:00Z'
  const endISO = row.valid_until ? `${row.valid_until}T23:59:59Z` : new Date().toISOString()

  let q = supabase
    .from('charges')
    .select('id, description, created_at, amount_cents, type')
    .eq('family_id', row.family_id)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .neq('status', 'voided')

  // Narrow by program type when the override is type-scoped
  if (row.program_type === 'private') {
    q = q.eq('type', 'private')
  }

  const { data: charges } = await q

  return {
    charges: (charges ?? []).map(c => ({
      id: c.id,
      description: c.description,
      createdAt: c.created_at,
      amountCents: c.amount_cents,
    })),
    totalAmountCents: (charges ?? []).reduce((sum, c) => sum + (c.amount_cents > 0 ? c.amount_cents : 0), 0),
  }
}
