'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface AvailabilityRecord {
  id: string
  team_id: string
  player_id: string
  match_date: string
  status: string
  responded_at: string | null
  note: string | null
}

interface Props {
  members: { id: string; name: string }[]
  dates: string[]
  availability: AvailabilityRecord[]
}

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-success text-white',
  unavailable: 'bg-danger text-white',
  maybe: 'bg-warning text-foreground',
  pending: 'bg-muted text-muted-foreground',
}

export function AvailabilityGrid({ members, dates, availability }: Props) {
  // Build lookup: `${playerId}-${date}` -> record
  const lookup = new Map<string, AvailabilityRecord>()
  availability.forEach((a) => {
    lookup.set(`${a.player_id}-${a.match_date}`, a)
  })

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead>Player</TableHead>
            {dates.map((d) => (
              <TableHead key={d} className="text-center">
                {new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.name}</TableCell>
              {dates.map((d) => {
                const record = lookup.get(`${m.id}-${d}`)
                const status = record?.status ?? 'pending'
                return (
                  <TableCell key={d} className="text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[status] ?? STATUS_COLORS.pending}`}
                      title={record?.note ?? undefined}
                    >
                      {status === 'pending' ? '?' : status.charAt(0).toUpperCase()}
                    </span>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
