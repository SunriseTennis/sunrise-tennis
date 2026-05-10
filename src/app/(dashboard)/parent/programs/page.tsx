import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { GraduationCap, Tag } from 'lucide-react'
import { ParentProgramFilters } from './program-filters'
import { EnrolledProgramsSection, type EnrolledByPlayer } from './enrolled-programs-section'
import { MULTI_GROUP_DISCOUNT_PCT, getPlayerSessionPriceBreakdown, isMultiGroupEligibleType } from '@/lib/utils/player-pricing'
import { isEligible } from '@/lib/utils/eligibility'

const MULTI_GROUP_TYPES = ['group', 'squad']

function MultiGroupBanner({ players }: { players: { id: string; firstName: string; enrolledCount: number }[] }) {
  // Build a per-player status snippet. We treat a player's "qualifying" state
  // as: enrolling in another eligible group right now would be 25% off.
  // That happens when enrolledCount >= 1.
  const qualifying = players.filter(p => p.enrolledCount >= 1)
  const notYet = players.filter(p => p.enrolledCount === 0)

  let detail: string
  if (qualifying.length === 0) {
    // Nobody qualifies yet. Generic enticement.
    detail = `Enrol any player in 2 groups and the second is ${MULTI_GROUP_DISCOUNT_PCT}% off — for the rest of the term, automatically.`
  } else if (qualifying.length === players.length) {
    const names = qualifying.map(p => p.firstName)
    detail = `${MULTI_GROUP_DISCOUNT_PCT}% off the next group for ${formatNameList(names)}.`
  } else {
    const qNames = qualifying.map(p => p.firstName)
    const ntNames = notYet.map(p => p.firstName)
    detail = `${MULTI_GROUP_DISCOUNT_PCT}% off the next group for ${formatNameList(qNames)}. ${formatNameList(ntNames)} ${ntNames.length === 1 ? 'qualifies' : 'qualify'} after enrolling in their first.`
  }

  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-3 shadow-card">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Tag className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          Multi-group savings · {MULTI_GROUP_DISCOUNT_PCT}% off the 2nd group, per child
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-800">{detail}</p>
      </div>
    </div>
  )
}

function formatNameList(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

export default async function ParentProgramsPage() {
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
  if (!familyId) redirect('/parent')

  // Get family's players to know their levels and eligibility
  // Plan 24 — ball_color + level columns retired; classifications is the
  // only signal. playerLevels is the union of all family-player classifications,
  // used to default the level filter on /parent/programs.
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, status, gender, classifications, track')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('first_name')

  const playerLevels = Array.from(
    new Set((players ?? []).flatMap(p => (p.classifications ?? []) as string[])),
  )
  const playerIds = players?.map(p => p.id) ?? []

  // Get all active programs with roster
  const { data: programs } = await supabase
    .from('programs')
    .select('id, name, type, level, day_of_week, start_time, end_time, max_capacity, per_session_cents, term_fee_cents, early_pay_discount_pct, early_bird_deadline, early_pay_discount_pct_tier2, early_bird_deadline_tier2, description, allowed_classifications, gender_restriction, track_required, program_roster(id, player_id, status)')
    .eq('status', 'active')
    .order('day_of_week')
    .order('start_time')

  // Get all scheduled sessions for active programs
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, program_id, date, start_time, end_time, status')
    .eq('status', 'scheduled')
    .order('date')

  // Get attendances for family players (to show booked vs away on calendar)
  const { data: attendances } = playerIds.length > 0
    ? await supabase
        .from('attendances')
        .select('session_id, player_id, status')
        .in('player_id', playerIds)
    : { data: [] }

  // Multi-group hint: per player, count their currently-enrolled programs of
  // eligible types (group/squad). 0 → "join 2 to save 25% on the 2nd";
  // 1 → "next group is 25% off"; ≥2 → "still saving 25% on any extra group".
  const multiGroupCountByPlayerId: Record<string, number> = {}
  if (players) {
    for (const p of players) multiGroupCountByPlayerId[p.id] = 0
    for (const prog of programs ?? []) {
      if (!MULTI_GROUP_TYPES.includes(prog.type ?? '')) continue
      const roster = (prog.program_roster ?? []) as { player_id: string; status: string }[]
      for (const r of roster) {
        if (r.status === 'enrolled' && multiGroupCountByPlayerId[r.player_id] !== undefined) {
          multiGroupCountByPlayerId[r.player_id] += 1
        }
      }
    }
  }

  const playersWithStatus = (players ?? []).map(p => ({
    id: p.id,
    firstName: p.first_name,
    enrolledCount: multiGroupCountByPlayerId[p.id] ?? 0,
  }))

  // Per-(player, program) effective price for the calendar popup. Only computed
  // for ELIGIBLE pairs of group/squad programs (private/competition/school keep
  // the program's per_session_cents in the popup). Batch in parallel — at
  // ~50-100ms per RPC and N×M ≤ ~50 pairs for a typical family, total well
  // under the perceived-fast threshold.
  type PlayerPriceRow = {
    playerId: string
    playerName: string
    effectivePerSessionCents: number
    basePerSessionCents: number
    morningSquadPartnerApplied: boolean
    multiGroupApplied: boolean
  }
  const playerPricesByProgramId: Record<string, PlayerPriceRow[]> = {}
  if (players && players.length > 0 && programs && programs.length > 0) {
    const pairs: Array<{ playerId: string; playerName: string; programId: string; programType: string | null }> = []
    for (const player of players) {
      for (const prog of programs) {
        if (!isMultiGroupEligibleType(prog.type)) continue // skip private/competition/school
        const ok = isEligible(
          { gender: (player.gender as 'male' | 'female' | 'non_binary' | null) ?? null, classifications: (player.classifications as string[] | null) ?? [], track: player.track ?? null },
          { day_of_week: prog.day_of_week, allowed_classifications: prog.allowed_classifications, gender_restriction: prog.gender_restriction, track_required: prog.track_required },
        ).ok
        if (!ok) continue
        pairs.push({ playerId: player.id, playerName: player.first_name, programId: prog.id, programType: prog.type ?? null })
      }
    }
    if (pairs.length > 0) {
      const breakdowns = await Promise.all(
        pairs.map(p => getPlayerSessionPriceBreakdown(supabase, familyId, p.programId, p.programType, p.playerId)),
      )
      pairs.forEach((p, i) => {
        const row: PlayerPriceRow = {
          playerId: p.playerId,
          playerName: p.playerName,
          effectivePerSessionCents: breakdowns[i].priceCents,
          basePerSessionCents: breakdowns[i].basePriceCents,
          morningSquadPartnerApplied: breakdowns[i].morningSquadPartnerApplied,
          multiGroupApplied: breakdowns[i].multiGroupApplied,
        }
        if (!playerPricesByProgramId[p.programId]) playerPricesByProgramId[p.programId] = []
        playerPricesByProgramId[p.programId].push(row)
      })
    }
  }

  // Build enrolled-programs-by-player groups for the new section
  const todayStr = new Date().toISOString().split('T')[0]
  const enrolledGroups: EnrolledByPlayer[] = []
  for (const p of players ?? []) {
    const enrolledForPlayer = (programs ?? []).filter((prog) => {
      const roster = (prog.program_roster ?? []) as { player_id: string; status: string }[]
      return roster.some((r) => r.player_id === p.id && r.status === 'enrolled')
    })
    if (enrolledForPlayer.length === 0) continue
    enrolledGroups.push({
      playerId: p.id,
      playerFirstName: p.first_name,
      programs: enrolledForPlayer.map((prog) => {
        const upcomingForProgram = (sessions ?? [])
          .filter((s) => s.program_id === prog.id && s.date >= todayStr && s.status === 'scheduled')
          .sort((a, b) => a.date.localeCompare(b.date))
        return {
          programId: prog.id,
          programName: prog.name,
          programType: prog.type ?? '',
          level: prog.level ?? null,
          dayOfWeek: prog.day_of_week ?? null,
          startTime: prog.start_time ?? null,
          endTime: prog.end_time ?? null,
          nextSessionDate: upcomingForProgram[0]?.date ?? null,
        }
      }),
    })
  }

  return (
    <div>
      <PageHeader title="Programs" description="Browse sessions and enrol in programs." />

      {playersWithStatus.length > 0 && (
        <MultiGroupBanner players={playersWithStatus} />
      )}

      {programs && programs.length > 0 ? (
        <div className="mt-6">
          <ParentProgramFilters
            programs={programs as never}
            sessions={(sessions ?? []) as never}
            playerLevels={playerLevels}
            familyPlayerIds={playerIds}
            familyPlayers={players?.map(p => ({
              id: p.id,
              name: p.first_name,
              gender: (p.gender as 'male' | 'female' | 'non_binary' | null) ?? null,
              classifications: (p.classifications as string[] | null) ?? [],
              track: p.track ?? null,
            })) ?? []}
            attendances={(attendances ?? []) as { session_id: string; player_id: string; status: string }[]}
            playerPricesByProgramId={playerPricesByProgramId}
          />
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={GraduationCap}
            title="No programs available"
            description="Check back soon for new programs."
          />
        </div>
      )}

      {enrolledGroups.length > 0 && (
        <EnrolledProgramsSection groups={enrolledGroups} />
      )}
    </div>
  )
}
