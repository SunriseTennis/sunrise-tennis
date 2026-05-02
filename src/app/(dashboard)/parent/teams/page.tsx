import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { ImageHero } from '@/components/image-hero'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Trophy, ChevronRight, CalendarDays, MessageSquare, Users } from 'lucide-react'

export default async function ParentTeamsPage() {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) redirect('/parent')

  // Get family's players
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name')
    .eq('family_id', userRole.family_id)

  const playerIds = players?.map((p) => p.id) ?? []
  const playerMap = new Map(players?.map((p) => [p.id, p.first_name]) ?? [])

  // Get teams these players are on, including competition info
  const { data: memberships } = playerIds.length > 0
    ? await supabase
        .from('team_members')
        .select('team_id, player_id, role, teams:team_id(id, name, season, status, division, competition_id, coaches:coach_id(name), competitions:competition_id(name, short_name, status))')
        .in('player_id', playerIds)
    : { data: [] }

  // Get pending availability checks
  const teamIds = [...new Set(memberships?.map((m) => m.team_id) ?? [])]

  const [{ data: pendingAvailability }, { data: nextAvailability }] = await Promise.all([
    teamIds.length > 0
      ? supabase
          .from('availability')
          .select('team_id')
          .in('team_id', teamIds)
          .in('player_id', playerIds)
          .eq('status', 'pending')
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? supabase
          .from('availability')
          .select('team_id, match_date')
          .in('team_id', teamIds)
          .gte('match_date', new Date().toISOString().split('T')[0])
          .order('match_date')
      : Promise.resolve({ data: [] }),
  ])

  const pendingByTeam = new Map<string, number>()
  pendingAvailability?.forEach((a) => {
    pendingByTeam.set(a.team_id, (pendingByTeam.get(a.team_id) ?? 0) + 1)
  })

  const nextMatchByTeam = new Map<string, string>()
  nextAvailability?.forEach((a) => {
    if (!nextMatchByTeam.has(a.team_id)) {
      nextMatchByTeam.set(a.team_id, a.match_date)
    }
  })

  // Group by team, collect player names + roles
  type TeamInfo = {
    team: {
      id: string; name: string; season: string | null; status: string
      division: string | null; coach: string | null
      competitionName: string | null
    }
    playerRoles: { name: string; role: string }[]
    pending: number
    nextMatch: string | null
  }
  const teamMap = new Map<string, TeamInfo>()
  memberships?.forEach((m) => {
    const team = m.teams as unknown as {
      id: string; name: string; season: string | null; status: string; division: string | null
      coaches: { name: string } | null
      competitions: { name: string; short_name: string | null; status: string } | null
    }
    if (!team) return

    const existing = teamMap.get(team.id)
    const playerName = playerMap.get(m.player_id) ?? ''
    const playerRole = { name: playerName, role: m.role }

    if (existing) {
      existing.playerRoles.push(playerRole)
    } else {
      teamMap.set(team.id, {
        team: {
          id: team.id,
          name: team.name,
          season: team.season,
          status: team.status,
          division: team.division,
          coach: team.coaches?.name ?? null,
          competitionName: team.competitions?.short_name ?? team.competitions?.name ?? null,
        },
        playerRoles: [playerRole],
        pending: pendingByTeam.get(team.id) ?? 0,
        nextMatch: nextMatchByTeam.get(team.id) ?? null,
      })
    }
  })

  const teams = [...teamMap.values()]

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  function formatMatchDate(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00')
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  }

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <ImageHero>
        <div>
          <p className="text-sm font-medium text-white/80">Competition</p>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="mt-0.5 text-sm text-white/70">Competition teams your players are part of</p>
        </div>
      </ImageHero>

      {teams.length > 0 ? (
        <div className="space-y-3">
          {teams.map(({ team, playerRoles, pending, nextMatch }, i) => (
            <div
              key={team.id}
              className="animate-fade-up overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all hover:shadow-elevated"
              style={{ animationDelay: `${(i + 1) * 60}ms` }}
            >
              <div className="flex">
                <div className={`w-1 shrink-0 ${team.status === 'active' ? 'bg-gradient-to-b from-[#E87450] to-[#F5B041]' : 'bg-muted'}`} />
                <div className="flex-1 p-4">
                  {/* Team header */}
                  <Link
                    href={`/parent/teams/${team.id}`}
                    className="group block"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-semibold text-foreground truncate">{team.name}</h2>
                          {team.division && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">{team.division}</Badge>
                          )}
                        </div>

                        {team.competitionName && (
                          <p className="mt-0.5 text-xs font-medium text-primary/80">
                            <Trophy className="mr-1 inline size-3 align-text-bottom" />
                            {team.competitionName}
                            {team.season ? ` \u2014 ${team.season}` : ''}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {team.coach && (
                            <span><Users className="mr-1 inline size-3 align-text-bottom" />Coach: {team.coach}</span>
                          )}
                          {nextMatch && (
                            <span><CalendarDays className="mr-1 inline size-3 align-text-bottom" />Next: {formatMatchDate(nextMatch)}</span>
                          )}
                        </div>

                        {/* Player roles */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {playerRoles.map((pr) => (
                            <span
                              key={pr.name}
                              className="inline-flex items-center rounded-full bg-[#FDD5D0] px-2 py-0.5 text-[11px] font-medium text-deep-navy"
                            >
                              {pr.name}
                              {pr.role !== 'member' && (
                                <span className="ml-1 text-[10px] opacity-60 capitalize">({pr.role})</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {pending > 0 && (
                          <Badge variant="outline" className="bg-warning-light text-warning border-warning/20 text-xs">
                            {pending} pending
                          </Badge>
                        )}
                        <ChevronRight className="size-4 text-muted-foreground opacity-40 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Link>

                  {/* Team Chat chevron row */}
                  {team.status === 'active' && (
                    <Link
                      href={`/parent/teams/${team.id}/chat`}
                      className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                    >
                      <MessageSquare className="size-3.5 text-primary/60" />
                      <span className="flex-1">Team Chat</span>
                      <ChevronRight className="size-3.5 opacity-40" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <EmptyState
            icon={Trophy}
            illustration="/images/illustrations/trophy.svg"
            title="No teams yet"
            description="Your children aren't on any competition teams yet. Ask your coach about joining a team!"
          />
        </div>
      )}
    </div>
  )
}
