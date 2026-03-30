import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AlertCircle, CheckCircle, Trash2, LinkIcon } from 'lucide-react'
import { removeCompPlayer } from '@/app/(dashboard)/admin/competitions/actions'
import { AddPlayerForm } from './add-player-form'
import { UTRSearch } from './utr-search'
import { LinkPlayer } from './link-player'

export default async function TeamRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string; teamId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { competitionId, teamId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const [{ data: team }, { data: competition }] = await Promise.all([
    supabase
      .from('teams')
      .select('*, coaches:coach_id(name)')
      .eq('id', teamId)
      .single(),
    supabase
      .from('competitions')
      .select('id, name')
      .eq('id', competitionId)
      .single(),
  ])

  if (!team || !competition) notFound()

  const { data: players } = await supabase
    .from('competition_players')
    .select('*')
    .eq('team_id', teamId)
    .order('sort_order')
    .order('registration_status', { ascending: false })
    .order('first_name')

  // For link-player: get all players from families
  const { data: familyPlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name, families:family_id(family_name)')
    .eq('status', 'active')
    .order('first_name')

  const coach = team.coaches as unknown as { name: string } | null
  const roster = players ?? []
  const required = team.team_size_required ?? 0
  const gaps = required > 0 ? Math.max(0, required - roster.length) : 0

  const removeAction = removeCompPlayer.bind(null, competitionId, teamId)

  return (
    <div>
      <PageHeader
        title={team.name}
        description={team.division ? `${team.division} — ${team.gender ?? ''}` : undefined}
        breadcrumbs={[
          { label: 'Competitions', href: '/admin/competitions' },
          { label: competition.name, href: `/admin/competitions/${competitionId}` },
        ]}
        action={<StatusBadge status={team.nomination_status ?? 'draft'} />}
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

      {/* Team Info */}
      <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
        {coach && <span>Coach: <strong className="text-foreground">{coach.name}</strong></span>}
        {team.age_group && <span>Age: <strong className="text-foreground capitalize">{team.age_group}</strong></span>}
        {required > 0 && (
          <span>
            Required: <strong className="text-foreground">{required}</strong> players
          </span>
        )}
        <span>
          Roster: <strong className="text-foreground">{roster.length}</strong>
          {gaps > 0 && <span className="ml-1 text-danger">({gaps} gap{gaps !== 1 ? 's' : ''})</span>}
        </span>
      </div>

      {/* Roster Table */}
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Player</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Registration</TableHead>
              <TableHead>UTR</TableHead>
              <TableHead>Linked</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.first_name}{p.last_name ? ` ${p.last_name}` : ''}
                  {!p.last_name && (
                    <span className="ml-1 text-xs text-warning">(surname?)</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.age ?? '-'}</TableCell>
                <TableCell>
                  <StatusBadge status={p.role} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.registration_status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.utr_rating_display ? (
                    <span className="font-mono text-sm">
                      {p.utr_rating_display}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({p.utr_rating_status})
                      </span>
                    </span>
                  ) : (
                    <UTRSearch
                      competitionId={competitionId}
                      teamId={teamId}
                      compPlayerId={p.id}
                      playerName={`${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`}
                    />
                  )}
                </TableCell>
                <TableCell>
                  {p.player_id ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <LinkIcon className="size-3" />
                      Linked
                    </span>
                  ) : (
                    <LinkPlayer
                      competitionId={competitionId}
                      teamId={teamId}
                      compPlayerId={p.id}
                      playerName={`${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`}
                      familyPlayers={familyPlayers ?? []}
                    />
                  )}
                </TableCell>
                <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                  {p.notes ?? ''}
                </TableCell>
                <TableCell>
                  <form action={removeAction}>
                    <input type="hidden" name="player_id" value={p.id} />
                    <Button variant="ghost" size="icon-xs" className="text-danger hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}

            {/* Gap rows */}
            {Array.from({ length: gaps }).map((_, i) => (
              <TableRow key={`gap-${i}`} className="bg-muted/20">
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground italic">
                  — need player —
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Player */}
      <details className="mt-6 rounded-xl border border-border bg-card shadow-sm">
        <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-foreground">
          Add Player
        </summary>
        <div className="px-6 pb-6">
          <AddPlayerForm competitionId={competitionId} teamId={teamId} />
        </div>
      </details>
    </div>
  )
}
