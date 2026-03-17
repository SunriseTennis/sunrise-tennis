import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Trophy, Plus } from 'lucide-react'

export default async function AdminTeamsPage() {
  const supabase = await createClient()

  const { data: teams } = await supabase
    .from('teams')
    .select('*, coaches:coach_id(name), programs:program_id(name)')
    .order('name')

  // Get member counts per team
  const { data: memberCounts } = await supabase
    .from('team_members')
    .select('team_id')

  const countMap = new Map<string, number>()
  memberCounts?.forEach((m) => {
    countMap.set(m.team_id, (countMap.get(m.team_id) ?? 0) + 1)
  })

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Manage competition teams, rosters, and availability."
        action={
          <Button asChild>
            <Link href="/admin/teams/new">
              <Plus className="size-4" />
              Create Team
            </Link>
          </Button>
        }
      />

      {teams && teams.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Team</TableHead>
                <TableHead>Season</TableHead>
                <TableHead>Coach</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => {
                const coach = team.coaches as unknown as { name: string } | null
                const program = team.programs as unknown as { name: string } | null
                return (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/teams/${team.id}`} className="hover:text-primary transition-colors">
                        {team.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{team.season ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{coach?.name ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{program?.name ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{countMap.get(team.id) ?? 0}</TableCell>
                    <TableCell>
                      <StatusBadge status={team.status ?? 'active'} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={Trophy}
            title="No teams created yet"
            description="Create a team to manage rosters and availability."
            action={
              <Button asChild size="sm">
                <Link href="/admin/teams/new">Create Team</Link>
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
