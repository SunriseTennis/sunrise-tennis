import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, AlertCircle, CheckCircle, Users, AlertTriangle } from 'lucide-react'

function formatDate(d: string | null): string {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { competitionId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const [{ data: competition }, { data: teams }] = await Promise.all([
    supabase
      .from('competitions')
      .select('*')
      .eq('id', competitionId)
      .single(),
    supabase
      .from('teams')
      .select('*, coaches:coach_id(name)')
      .eq('competition_id', competitionId)
      .order('division')
      .order('name'),
  ])

  if (!competition) notFound()

  // Get player counts per team
  const teamIds = teams?.map((t) => t.id) ?? []
  const { data: allPlayers } = teamIds.length > 0
    ? await supabase
        .from('competition_players')
        .select('id, team_id, registration_status, role')
        .in('team_id', teamIds)
    : { data: [] }

  const playersByTeam = new Map<string, typeof allPlayers>()
  allPlayers?.forEach((p) => {
    const arr = playersByTeam.get(p.team_id) ?? []
    arr.push(p)
    playersByTeam.set(p.team_id, arr)
  })

  return (
    <div>
      <PageHeader
        title={competition.name}
        description={competition.season}
        breadcrumbs={[{ label: 'Competitions', href: '/admin/competitions' }]}
        action={<StatusBadge status={competition.status ?? 'active'} />}
      />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          <CheckCircle className="size-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Key Dates */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold text-foreground">Key Dates</h2>
          <div className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Nominations Open</dt>
              <dd>{formatDate(competition.nomination_open)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Nominations Close</dt>
              <dd className="font-medium">{formatDate(competition.nomination_close)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Season</dt>
              <dd>{formatDate(competition.season_start)} — {formatDate(competition.season_end)}</dd>
            </div>
            {competition.finals_start && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Finals</dt>
                <dd>{formatDate(competition.finals_start)} — {formatDate(competition.finals_end)}</dd>
              </div>
            )}
          </div>
          {competition.notes && (
            <p className="mt-3 text-sm text-muted-foreground">{competition.notes}</p>
          )}
        </CardContent>
      </Card>

      {/* Teams */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Teams</h2>
        <Button asChild size="sm">
          <Link href={`/admin/competitions/${competitionId}/teams/new`}>
            <Plus className="size-4" />
            Add Team
          </Link>
        </Button>
      </div>

      {teams && teams.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const coach = team.coaches as unknown as { name: string } | null
            const teamPlayers = playersByTeam.get(team.id) ?? []
            const total = teamPlayers.length
            const registered = teamPlayers.filter((p) => p.registration_status === 'registered').length
            const required = team.team_size_required ?? 0
            const hasGaps = required > 0 && total < required

            return (
              <Link
                key={team.id}
                href={`/admin/competitions/${competitionId}/teams/${team.id}`}
                className="block rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{team.name}</p>
                    {team.division && (
                      <p className="text-xs text-muted-foreground">{team.division}</p>
                    )}
                  </div>
                  <StatusBadge status={team.nomination_status ?? 'draft'} />
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" />
                    {total}{required > 0 ? `/${required}` : ''} players
                  </span>
                  {registered > 0 && (
                    <span className="text-success">{registered} reg</span>
                  )}
                  {coach && <span>{coach.name}</span>}
                </div>

                {hasGaps && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-danger-light px-2 py-0.5 text-xs font-medium text-danger">
                    <AlertTriangle className="size-3" />
                    {required - total} gap{required - total !== 1 ? 's' : ''}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No teams yet. Add a team to get started.</p>
      )}
    </div>
  )
}
