import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils/dates'
import { AddMemberForm } from './add-member-form'
import { AvailabilityGrid } from './availability-grid'
import { sendAvailabilityCheck, removeTeamMember } from '../actions'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MessageSquare, Send, AlertCircle, CheckCircle } from 'lucide-react'

export default async function AdminTeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { teamId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const [
    { data: team },
    { data: members },
    { data: availability },
    { data: allPlayers },
  ] = await Promise.all([
    supabase
      .from('teams')
      .select('*, coaches:coach_id(name), programs:program_id(name)')
      .eq('id', teamId)
      .single(),
    supabase
      .from('team_members')
      .select('*, players:player_id(first_name, last_name, classifications, family_id)')
      .eq('team_id', teamId)
      .order('role'),
    supabase
      .from('availability')
      .select('*')
      .eq('team_id', teamId)
      .order('match_date', { ascending: false }),
    supabase
      .from('players')
      .select('id, first_name, last_name, classifications')
      .eq('status', 'active')
      .order('first_name'),
  ])

  if (!team) notFound()

  const coach = team.coaches as unknown as { name: string } | null
  const program = team.programs as unknown as { name: string } | null
  const memberPlayerIds = new Set(members?.map((m) => m.player_id) ?? [])
  const eligiblePlayers = allPlayers?.filter((p) => !memberPlayerIds.has(p.id)) ?? []

  // Group availability by date
  const availabilityByDate = new Map<string, typeof availability>()
  availability?.forEach((a) => {
    const existing = availabilityByDate.get(a.match_date) ?? []
    existing.push(a)
    availabilityByDate.set(a.match_date, existing)
  })

  const removeAction = removeTeamMember.bind(null, teamId)
  const availabilityAction = sendAvailabilityCheck.bind(null, teamId)

  const roleBadgeStyle: Record<string, string> = {
    captain: 'bg-warning-light text-warning border-warning/20',
    reserve: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <div>
      <PageHeader
        title={team.name}
        breadcrumbs={[{ label: 'Teams', href: '/admin/teams' }]}
        action={<StatusBadge status={team.status ?? 'active'} />}
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

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Team Info */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Details</h2>
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Season</dt>
                <dd className="text-sm text-foreground">{team.season ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Coach</dt>
                <dd className="text-sm text-foreground">{coach?.name ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Program</dt>
                <dd className="text-sm text-foreground">{program?.name ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Members</dt>
                <dd className="text-sm text-foreground">{members?.length ?? 0}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/teams/${teamId}/chat`}>
                  <MessageSquare className="size-4" />
                  Team Chat
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Members */}
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Roster</h2>

            {members && members.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Player</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => {
                      const player = m.players as unknown as { first_name: string; last_name: string; classifications: string[] | null }
                      return (
                        <TableRow key={m.id}>
                          <TableCell>{player?.first_name} {player?.last_name}</TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {(player?.classifications ?? []).length > 0 ? (player?.classifications ?? []).join(' / ') : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`capitalize ${roleBadgeStyle[m.role] ?? 'bg-info-light text-info border-info/20'}`}
                            >
                              {m.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <form action={removeAction}>
                              <input type="hidden" name="member_id" value={m.id} />
                              <button type="submit" className="text-xs font-medium text-danger hover:text-danger/80 transition-colors">Remove</button>
                            </form>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No members yet.</p>
            )}

            <div className="mt-4">
              <AddMemberForm teamId={teamId} players={eligiblePlayers} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Availability Section */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Availability</h2>

        {/* Send availability check form */}
        <form action={availabilityAction} className="mt-4 flex items-end gap-3">
          <div>
            <Label htmlFor="match_date">Match Date</Label>
            <Input
              id="match_date"
              name="match_date"
              type="date"
              required
              className="mt-1"
            />
          </div>
          <Button type="submit">
            <Send className="size-4" />
            Send Availability Check
          </Button>
        </form>

        {/* Availability grid */}
        {availabilityByDate.size > 0 && members && (
          <div className="mt-4">
            <AvailabilityGrid
              members={members.map((m) => {
                const player = m.players as unknown as { first_name: string; last_name: string }
                return { id: m.player_id, name: `${player.first_name} ${player.last_name}` }
              })}
              dates={[...availabilityByDate.keys()].slice(0, 8)}
              availability={availability ?? []}
            />
          </div>
        )}
      </div>
    </div>
  )
}
