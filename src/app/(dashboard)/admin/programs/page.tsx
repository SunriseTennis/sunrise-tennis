import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
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
import { GraduationCap, Plus } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function ProgramsPage() {
  const supabase = await createClient()

  const { data: programs } = await supabase
    .from('programs')
    .select('*, program_roster(count)')
    .order('day_of_week')
    .order('start_time')

  return (
    <div>
      <PageHeader
        title="Programs"
        action={
          <Button asChild>
            <Link href="/admin/programs/new">
              <Plus className="size-4" />
              Add program
            </Link>
          </Button>
        }
      />

      {programs && programs.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Day / Time</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead className="text-right">Per Session</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.map((p) => {
                const enrolled = (p.program_roster as unknown as { count: number }[])?.[0]?.count ?? 0
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/programs/${p.id}`} className="hover:text-primary transition-colors">{p.name}</Link>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.type}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.level}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.day_of_week != null ? DAYS[p.day_of_week] : '-'}
                      {p.start_time && ` ${formatTime(p.start_time)}`}
                      {p.end_time && ` - ${formatTime(p.end_time)}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {enrolled}{p.max_capacity ? `/${p.max_capacity}` : ''}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {p.per_session_cents ? formatCurrency(p.per_session_cents) : '-'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status ?? 'active'} />
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
            icon={GraduationCap}
            title="No programs yet"
            description="Create your first program to start scheduling sessions."
            action={
              <Button asChild size="sm">
                <Link href="/admin/programs/new">Add program</Link>
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
