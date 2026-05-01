import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getSessionPrice } from './billing'

type Supabase = SupabaseClient<Database>

const MORNING_SQUAD_SLUGS = ['tue-morning-squad', 'thu-morning-squad'] as const

/**
 * Morning squad cross-day discount: $25/session for the first morning squad
 * a player enrols in, $15/session for the second (Tue + Thu pair).
 *
 * Implementation: when computing per-session price for either morning squad
 * AND the player is already enrolled in the partner morning squad, return
 * 1500 (cents) instead of the program's default. Otherwise fall through to
 * the standard pricing path (family overrides → program default).
 */
export async function getMorningSquadSessionPrice(
  supabase: Supabase,
  familyId: string,
  programId: string,
  programType: string | null | undefined,
  playerId: string,
): Promise<number> {
  // Fast path: only morning squads pay attention to the cross-day rule.
  const { data: prog } = await supabase
    .from('programs')
    .select('slug')
    .eq('id', programId)
    .maybeSingle()

  const slug = prog?.slug as string | null | undefined
  if (!slug || !(MORNING_SQUAD_SLUGS as readonly string[]).includes(slug)) {
    return getSessionPrice(supabase, familyId, programId, programType ?? null)
  }

  // The partner morning squad slug
  const partnerSlug = slug === 'tue-morning-squad' ? 'thu-morning-squad' : 'tue-morning-squad'

  const { data: partner } = await supabase
    .from('programs')
    .select('id')
    .eq('slug', partnerSlug)
    .maybeSingle()

  if (!partner) {
    return getSessionPrice(supabase, familyId, programId, programType ?? null)
  }

  const { data: roster } = await supabase
    .from('program_roster')
    .select('id')
    .eq('program_id', partner.id)
    .eq('player_id', playerId)
    .eq('status', 'enrolled')
    .maybeSingle()

  if (roster) {
    // Player is already enrolled in the other morning squad → $15
    return 1500
  }

  return getSessionPrice(supabase, familyId, programId, programType ?? null)
}
