import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Swords, Plus, AlertTriangle, CalendarClock } from 'lucide-react'

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default async function AdminCompetitionsPage() {
  const supabase = await createClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('*')
    .order('nomination_close', { ascending: true })

  // Get team + player counts per competition
  const { data: teams } = await supabase
    .from('teams')
    .select('id, competition_id, team_size_required')
    .not('competition_id', 'is', null)

  const { data: players } = await supabase
    .from('competition_players')
    .select('id, team_id, registration_status')

  // Build stats per competition
  const teamsByComp = new Map<string, typeof teams>()
  teams?.forEach((t) => {
    if (!t.competition_id) return
    const arr = teamsByComp.get(t.competition_id) ?? []
    arr.push(t)
    teamsByComp.set(t.competition_id, arr)
  })

  const playersByTeam = new Map<string, typeof players>()
  players?.forEach((p) => {
    const arr = playersByTeam.get(p.team_id) ?? []
    arr.push(p)
    playersByTeam.set(p.team_id, arr)
  })

  return (
    <div>
      <PageHeader
        title="Competitions"
        description="Manage competition teams, rosters, and registrations."
        action={
          <Button asChild>
            <Link href="/admin/competitions/new">
              <Plus className="size-4" />
              New Competition
            </Link>
          </Button>
        }
      />

      {competitions && competitions.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map((comp) => {
            const compTeams = teamsByComp.get(comp.id) ?? []
            const teamCount = compTeams.length
            let playerCount = 0
            let registeredCount = 0
            let unregisteredCount = 0
            let totalGaps = 0

            compTeams.forEach((t) => {
              const teamPlayers = playersByTeam.get(t.id) ?? []
              const mainstays = teamPlayers.filter((p) => p.registration_status !== undefined)
              playerCount += mainstays.length
              registeredCount += mainstays.filter((p) => p.registration_status === 'registered').length
              unregisteredCount += mainstays.filter((p) => p.registration_status === 'unregistered').length
              if (t.team_size_required && mainstays.length < t.team_size_required) {
                totalGaps += t.team_size_required - mainstays.length
              }
            })

            const daysLeft = daysUntil(comp.nomination_close)
            const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7

            return (
              <Link
                key={comp.id}
                href={`/admin/competitions/${comp.id}`}
                className="block rounded-xl border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{comp.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{comp.season}</p>
                  </div>
                  <StatusBadge status={comp.status ?? 'active'} />
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{teamCount} team{teamCount !== 1 ? 's' : ''}</span>
                  <span>{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
                  {registeredCount > 0 && (
                    <span className="text-success">{registeredCount} registered</span>
                  )}
                  {unregisteredCount > 0 && (
                    <span className="text-danger">{unregisteredCount} unregistered</span>
                  )}
                </div>

                {(totalGaps > 0 || isUrgent) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {totalGaps > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger-light px-2 py-0.5 text-xs font-medium text-danger">
                        <AlertTriangle className="size-3" />
                        {totalGaps} gap{totalGaps !== 1 ? 's' : ''}
                      </span>
                    )}
                    {isUrgent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-light px-2 py-0.5 text-xs font-medium text-warning">
                        <CalendarClock className="size-3" />
                        {daysLeft === 0 ? 'Closes today' : `${daysLeft}d to nominate`}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={Swords}
            title="No competitions yet"
            description="Create a competition to start managing teams and rosters."
            action={
              <Button asChild size="sm">
                <Link href="/admin/competitions/new">New Competition</Link>
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
