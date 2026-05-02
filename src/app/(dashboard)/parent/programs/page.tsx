import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { GraduationCap, Tag } from 'lucide-react'
import { ParentProgramFilters } from './program-filters'
import { MULTI_GROUP_DISCOUNT_PCT } from '@/lib/utils/player-pricing'

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
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, ball_color, level, status, gender, classifications, track')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('first_name')

  const playerLevels = players?.map(p => p.ball_color).filter(Boolean) as string[] ?? []
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
    </div>
  )
}
