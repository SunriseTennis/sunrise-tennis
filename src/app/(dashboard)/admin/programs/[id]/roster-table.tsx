'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronDown, ChevronRight, UserMinus } from 'lucide-react'
import { adminUnenrolFromProgram } from '../../actions'

type RosterPlayer = {
  rosterId: string
  rosterStatus: string
  playerId: string
  firstName: string
  lastName: string
  classifications: string[]
  currentFocus: string[] | null
  familyDisplayId: string | null
  familyName: string | null
}

type AttendanceTotals = { present: number; absent: number; noshow: number }

export function RosterTable({
  programId,
  roster,
  maxCapacity,
  attendanceTotals,
  completedCount,
  latestNotes,
}: {
  programId: string
  roster: RosterPlayer[]
  maxCapacity: number | null
  attendanceTotals: Record<string, AttendanceTotals>
  completedCount: number
  latestNotes: Record<string, { focus: string | null; progress: string | null }>
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function onUnenrol(playerId: string, playerName: string) {
    if (!confirm(`Unenrol ${playerName} from this program? Future scheduled charges will be voided.`)) return
    const fd = new FormData()
    fd.set('program_id', programId)
    fd.set('player_id', playerId)
    startTransition(async () => {
      await adminUnenrolFromProgram(fd)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-8" />
            <TableHead>Player</TableHead>
            <TableHead>Family</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.map((r) => {
            const isExpanded = expandedId === r.playerId
            const totals = attendanceTotals[r.playerId]
            const totalMarked = totals ? totals.present + totals.absent + totals.noshow : 0
            const rate = totalMarked > 0 ? Math.round((totals.present / totalMarked) * 100) : null
            const notes = latestNotes[r.playerId]
            const canUnenrol = r.rosterStatus === 'enrolled'
            const hasExtra = (r.currentFocus && r.currentFocus.length > 0) || notes || rate !== null || canUnenrol

            return (
              <>
                <TableRow
                  key={r.rosterId}
                  className={`${hasExtra ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-muted/30' : ''}`}
                  onClick={() => hasExtra && setExpandedId(isExpanded ? null : r.playerId)}
                >
                  <TableCell className="w-8 px-2">
                    {hasExtra && (
                      isExpanded
                        ? <ChevronDown className="size-3.5 text-muted-foreground" />
                        : <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{r.firstName} {r.lastName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.familyDisplayId} ({r.familyName})
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {r.classifications.length > 0 ? r.classifications.join(' / ') : '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.rosterStatus} />
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${r.rosterId}-detail`} className="bg-muted/20 hover:bg-muted/20">
                    <TableCell />
                    <TableCell colSpan={4}>
                      <div className="space-y-2 py-1 text-sm">
                        {rate !== null && (
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">Attendance:</span>
                            <span className={`font-medium tabular-nums ${rate >= 80 ? 'text-success' : rate >= 50 ? 'text-amber-600' : 'text-danger'}`}>
                              {rate}%
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({totals.present}/{completedCount} sessions)
                            </span>
                          </div>
                        )}
                        {r.currentFocus && r.currentFocus.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Focus:</span>
                            <div className="flex flex-wrap gap-1">
                              {r.currentFocus.map((f, i) => (
                                <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  {f}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {notes?.focus && (
                          <div>
                            <span className="text-muted-foreground">Last focus: </span>
                            <span className="text-foreground">{notes.focus}</span>
                          </div>
                        )}
                        {notes?.progress && (
                          <div>
                            <span className="text-muted-foreground">Last progress: </span>
                            <span className="text-foreground">{notes.progress}</span>
                          </div>
                        )}
                        {r.rosterStatus === 'enrolled' && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => onUnenrol(r.playerId, `${r.firstName} ${r.lastName}`)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/5 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                            >
                              <UserMinus className="size-3" /> Unenrol
                            </button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
