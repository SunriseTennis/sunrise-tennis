import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { PlayersTable } from './players-table'

export default async function PlayersPage() {
  const supabase = await createClient()

  const [{ data: players }, { data: rosterEntries }, { data: compEntries }] = await Promise.all([
    supabase
      .from('players')
      .select('id, first_name, last_name, preferred_name, dob, ball_color, level, gender, status, classifications, track, media_consent_coaching, media_consent_family, media_consent_social, comp_interest, family_id, families:family_id(id, display_id, family_name)')
      .order('last_name'),
    supabase
      .from('program_roster')
      .select('player_id, programs:program_id(id, name)')
      .eq('status', 'enrolled'),
    supabase
      .from('competition_players')
      .select('player_id, role, registration_status, utr_rating_display, teams:team_id(name, competitions:competition_id(id, name, short_name))')
      .not('player_id', 'is', null),
  ])

  // Build lookup maps
  const programsByPlayer = new Map<string, string[]>()
  for (const entry of rosterEntries ?? []) {
    const prog = entry.programs as unknown as { id: string; name: string } | null
    if (prog && entry.player_id) {
      const existing = programsByPlayer.get(entry.player_id) ?? []
      existing.push(prog.name)
      programsByPlayer.set(entry.player_id, existing)
    }
  }

  const compsByPlayer = new Map<string, { compName: string; teamName: string; role: string; regStatus: string; utr: string | null; compId: string }[]>()
  for (const entry of compEntries ?? []) {
    if (!entry.player_id) continue
    const team = entry.teams as unknown as { name: string; competitions: { id: string; name: string; short_name: string | null } } | null
    if (team) {
      const existing = compsByPlayer.get(entry.player_id) ?? []
      existing.push({
        compName: team.competitions.short_name ?? team.competitions.name,
        teamName: team.name,
        role: entry.role,
        regStatus: entry.registration_status,
        utr: entry.utr_rating_display,
        compId: team.competitions.id,
      })
      compsByPlayer.set(entry.player_id, existing)
    }
  }

  const enrichedPlayers = (players ?? []).map((p) => {
    const fam = p.families as unknown as { id: string; display_id: string; family_name: string } | null
    const comps = compsByPlayer.get(p.id) ?? []
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      preferredName: p.preferred_name,
      dob: p.dob,
      ballColor: p.ball_color,
      level: p.level,
      gender: p.gender,
      status: (p.status as 'active' | 'inactive' | 'archived'),
      classifications: (p.classifications as string[] | null) ?? [],
      track: (p.track as 'performance' | 'participation' | null) ?? 'participation',
      mediaConsent: (() => {
        const flags = [p.media_consent_coaching, p.media_consent_family, p.media_consent_social].map(Boolean)
        const on = flags.filter(Boolean).length
        if (on === 0) return 'none' as const
        if (on === 3) return 'all' as const
        return 'partial' as const
      })(),
      compInterest: p.comp_interest,
      familyId: fam?.id ?? p.family_id,
      familyDisplayId: fam?.display_id ?? '',
      familyName: fam?.family_name ?? '',
      programs: programsByPlayer.get(p.id) ?? [],
      comps,
      utr: comps.find(c => c.utr)?.utr ?? null,
    }
  })

  return (
    <div>
      <PageHeader title="Players" />
      <PlayersTable players={enrichedPlayers} />
    </div>
  )
}
