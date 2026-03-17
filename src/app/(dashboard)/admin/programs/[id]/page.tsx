import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { ProgramEditForm } from './program-edit-form'
import { AdminEnrolForm } from './admin-enrol-form'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: program }, { data: roster }, { data: allFamilies }] = await Promise.all([
    supabase.from('programs').select('*').eq('id', id).single(),
    supabase.from('program_roster')
      .select('id, status, enrolled_at, players(id, first_name, last_name, ball_color, families(display_id, family_name))')
      .eq('program_id', id)
      .order('enrolled_at'),
    supabase.from('families')
      .select('id, display_id, family_name, players(id, first_name, last_name)')
      .eq('status', 'active')
      .order('display_id'),
  ])

  if (!program) notFound()

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={program.name}
        breadcrumbs={[{ label: 'Programs', href: '/admin/programs' }]}
        action={<StatusBadge status={program.status ?? 'active'} />}
      />

      <div className="mt-6 space-y-8">
        {/* Program details */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Program Details</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Type</dt>
                <dd className="text-sm capitalize text-foreground">{program.type}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Level</dt>
                <dd className="text-sm capitalize text-foreground">{program.level}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Day</dt>
                <dd className="text-sm text-foreground">{program.day_of_week != null ? DAYS[program.day_of_week] : '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Time</dt>
                <dd className="text-sm text-foreground">
                  {program.start_time ? formatTime(program.start_time) : '-'}
                  {program.end_time ? ` - ${formatTime(program.end_time)}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Capacity</dt>
                <dd className="text-sm text-foreground">{program.max_capacity ?? 'Unlimited'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Per Session</dt>
                <dd className="text-sm text-foreground">{program.per_session_cents ? formatCurrency(program.per_session_cents) : '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Term Fee</dt>
                <dd className="text-sm text-foreground">{program.term_fee_cents ? formatCurrency(program.term_fee_cents) : '-'}</dd>
              </div>
              {program.description && (
                <div className="sm:col-span-3">
                  <dt className="text-xs font-medium text-muted-foreground">Description</dt>
                  <dd className="text-sm text-foreground">{program.description}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Roster */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">
              Roster ({roster?.length ?? 0}{program.max_capacity ? `/${program.max_capacity}` : ''})
            </h2>
            {roster && roster.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Player</TableHead>
                      <TableHead>Family</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.map((r) => {
                      const player = r.players as unknown as { id: string; first_name: string; last_name: string; ball_color: string | null; families: { display_id: string; family_name: string } | null } | null
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{player?.first_name} {player?.last_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {player?.families?.display_id} ({player?.families?.family_name})
                          </TableCell>
                          <TableCell className="capitalize text-muted-foreground">{player?.ball_color ?? '-'}</TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No players enrolled yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Admin enrol on behalf */}
        <AdminEnrolForm
          programId={id}
          families={(allFamilies ?? []).map(f => ({
            id: f.id,
            displayId: f.display_id,
            familyName: f.family_name,
            players: ((f.players as unknown as { id: string; first_name: string; last_name: string }[]) ?? []).map(p => ({
              id: p.id,
              firstName: p.first_name,
              lastName: p.last_name,
            })),
          }))}
        />

        {/* Edit */}
        <ProgramEditForm program={program} />
      </div>
    </div>
  )
}
