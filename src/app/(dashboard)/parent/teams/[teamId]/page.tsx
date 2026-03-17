import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AvailabilityForm } from './availability-form'
import { respondToAvailability } from '../actions'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, AlertCircle, CheckCircle } from 'lucide-react'

export default async function ParentTeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { teamId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole?.family_id) redirect('/parent')

  const { data: team } = await supabase
    .from('teams')
    .select('*, coaches:coach_id(name)')
    .eq('id', teamId)
    .single()

  if (!team) notFound()

  const coach = team.coaches as unknown as { name: string } | null

  // Get family's players on this team
  const { data: familyPlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .eq('family_id', userRole.family_id)

  const familyPlayerIds = familyPlayers?.map((p) => p.id) ?? []

  const { data: memberships } = await supabase
    .from('team_members')
    .select('player_id, role')
    .eq('team_id', teamId)
    .in('player_id', familyPlayerIds)

  const memberPlayerIds = memberships?.map((m) => m.player_id) ?? []

  // Get pending availability for family's players
  const { data: pendingAvailability } = memberPlayerIds.length > 0
    ? await supabase
        .from('availability')
        .select('*')
        .eq('team_id', teamId)
        .in('player_id', memberPlayerIds)
        .order('match_date')
    : { data: [] }

  // Get all team members for roster display
  const { data: allMembers } = await supabase
    .from('team_members')
    .select('*, players:player_id(first_name, last_name, ball_color)')
    .eq('team_id', teamId)
    .order('role')

  const playersOnTeam = familyPlayers?.filter((p) => memberPlayerIds.includes(p.id)) ?? []
  const pendingChecks = pendingAvailability?.filter((a) => a.status === 'pending' || a.status === 'maybe') ?? []
  const action = respondToAvailability.bind(null, teamId)

  const roleBadgeStyle: Record<string, string> = {
    captain: 'bg-warning-light text-warning border-warning/20',
    reserve: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={team.name}
        breadcrumbs={[{ label: 'Teams', href: '/parent/teams' }]}
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

      <div className="mt-6 space-y-6">
        {/* Team info */}
        <Card>
          <CardContent className="pt-6">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Season</dt>
                <dd className="text-sm text-foreground">{team.season ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Coach</dt>
                <dd className="text-sm text-foreground">{coach?.name ?? '-'}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link href={`/parent/teams/${teamId}/chat`}>
                  <MessageSquare className="size-4" />
                  Team Chat
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Availability response */}
        {pendingChecks.length > 0 && playersOnTeam.length > 0 && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
            <h2 className="text-lg font-semibold text-primary">Availability Check</h2>
            <p className="mt-1 text-sm text-primary/80">Please respond for each of your players.</p>
            <div className="mt-4">
              <AvailabilityForm
                players={playersOnTeam}
                pendingAvailability={pendingChecks}
                action={action}
              />
            </div>
          </div>
        )}

        {/* Previous responses */}
        {pendingAvailability && pendingAvailability.filter((a) => a.status !== 'pending').length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Your Responses</h2>
              <div className="mt-3 space-y-2">
                {pendingAvailability.filter((a) => a.status !== 'pending').map((a) => {
                  const player = playersOnTeam.find((p) => p.id === a.player_id)
                  return (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        {player?.first_name} - {new Date(a.match_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Full team roster */}
        {allMembers && allMembers.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Team Roster</h2>
              <div className="mt-3 space-y-2">
                {allMembers.map((m) => {
                  const player = m.players as unknown as { first_name: string; last_name: string; ball_color: string | null }
                  return (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{player?.first_name} {player?.last_name}</span>
                      <Badge
                        variant="outline"
                        className={`capitalize ${roleBadgeStyle[m.role] ?? 'bg-info-light text-info border-info/20'}`}
                      >
                        {m.role}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
