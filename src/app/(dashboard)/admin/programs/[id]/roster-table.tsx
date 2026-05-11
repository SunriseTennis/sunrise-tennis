'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  ChevronDown, ChevronRight, UserMinus, Trash2, Loader2, AlertTriangle,
  Phone, Mail, X,
} from 'lucide-react'
import {
  adminUnenrolFromProgram,
  bulkUnenrolPlayersFromProgram,
  deleteProgramRosterEntry,
  bulkDeleteProgramRosterEntries,
} from '../../actions'
import { PlayerPill, FamilyPill } from '@/components/admin/entity-pills'
import { cn } from '@/lib/utils/cn'

type EntryType = 'term' | 'withdrawn' | 'casual' | 'trial'

type RosterEntry = {
  rosterId: string | null
  type: EntryType
  playerId: string
  firstName: string
  lastName: string
  classifications: string[]
  currentFocus: string[] | null
  familyId: string | null
  familyDisplayId: string | null
  familyName: string | null
  primaryContact: { name: string | null; phone: string | null; email: string | null }
  secondaryContact: { name: string | null; phone: string | null; email: string | null } | null
  nonTermBookingCount?: number
}

type AttendanceTotals = { present: number; absent: number; noshow: number }

const TYPE_STYLES: Record<EntryType, string> = {
  term:      'bg-success/15 text-success border-success/30',
  withdrawn: 'bg-muted text-muted-foreground border-border',
  casual:    'bg-amber-100 text-amber-800 border-amber-300',
  trial:     'bg-secondary/20 text-secondary-foreground border-secondary/40',
}

const TYPE_LABEL: Record<EntryType, string> = {
  term:      'Term',
  withdrawn: 'Withdrawn',
  casual:    'Casual',
  trial:     'Trial',
}

export function RosterTable({
  programId,
  roster,
  attendanceTotals,
  completedCount,
  latestNotes,
}: {
  programId: string
  roster: RosterEntry[]
  maxCapacity: number | null
  attendanceTotals: Record<string, AttendanceTotals>
  completedCount: number
  latestNotes: Record<string, { focus: string | null; progress: string | null }>
}) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [rowDeleteState, setRowDeleteState] = useState<Record<string, { phase: 'blocked'; blockers: Record<string, number>; total: number }>>({})

  function togglePlayer(playerId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(roster.map(r => r.playerId)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function onUnenrolOne(entry: RosterEntry) {
    if (!confirm(`Unenrol ${entry.firstName} ${entry.lastName} from this program? Future scheduled charges will be voided.`)) return
    setFeedback(null)
    const fd = new FormData()
    fd.set('program_id', programId)
    fd.set('player_id', entry.playerId)
    startTransition(async () => {
      try {
        await adminUnenrolFromProgram(fd)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('NEXT_REDIRECT')) console.error('unenrol failed', e)
      }
      router.refresh()
    })
  }

  function onDeleteOne(entry: RosterEntry, cascade: boolean) {
    if (!cascade) {
      setFeedback(null)
      startTransition(async () => {
        const r = await deleteProgramRosterEntry({ programId, playerId: entry.playerId, cascade: false })
        if (r.error) {
          setFeedback({ kind: 'error', message: `${entry.firstName} ${entry.lastName}: ${r.error}` })
          return
        }
        if (r.blocked && r.blockers) {
          const total = Object.values(r.blockers).reduce((s, n) => s + n, 0)
          setRowDeleteState(prev => ({
            ...prev,
            [entry.playerId]: { phase: 'blocked', blockers: r.blockers!, total },
          }))
          // Auto-expand to show the explanation
          setExpandedId(entry.playerId)
          return
        }
        if (r.deleted) {
          setRowDeleteState(prev => {
            const next = { ...prev }
            delete next[entry.playerId]
            return next
          })
          setFeedback({ kind: 'success', message: `${entry.firstName} ${entry.lastName} deleted from roster.` })
          router.refresh()
        }
      })
      return
    }

    if (!confirm(`Wipe ALL data for ${entry.firstName} ${entry.lastName} on this program? This voids every charge and deletes attendances + bookings + lesson notes. Cannot be undone.`)) return
    setFeedback(null)
    startTransition(async () => {
      const r = await deleteProgramRosterEntry({ programId, playerId: entry.playerId, cascade: true })
      if (r.error) {
        setFeedback({ kind: 'error', message: `${entry.firstName} ${entry.lastName}: ${r.error}` })
        return
      }
      if (r.deleted && r.cascade) {
        const s = r.cascadeStats!
        const parts = [
          s.charges_voided ? `${s.charges_voided} charges voided` : null,
          s.attendances_deleted ? `${s.attendances_deleted} attendances` : null,
          s.bookings_deleted ? `${s.bookings_deleted} bookings` : null,
          s.lesson_notes_deleted ? `${s.lesson_notes_deleted} notes` : null,
        ].filter(Boolean).join(', ')
        setRowDeleteState(prev => {
          const next = { ...prev }
          delete next[entry.playerId]
          return next
        })
        setFeedback({ kind: 'success', message: `${entry.firstName} ${entry.lastName} wiped. ${parts || 'Nothing extra to clean up.'}` })
        router.refresh()
      }
    })
  }

  function termSelectedIds() {
    return Array.from(selected).filter(id => {
      const e = roster.find(r => r.playerId === id)
      return e && e.type === 'term'
    })
  }

  function onBulkUnenrol() {
    const ids = termSelectedIds()
    if (ids.length === 0) {
      setFeedback({ kind: 'error', message: 'No term-enrolled players in selection.' })
      return
    }
    if (!confirm(`Unenrol ${ids.length} selected player${ids.length === 1 ? '' : 's'}? Future scheduled charges will be voided.`)) return
    setFeedback(null)
    startTransition(async () => {
      const r = await bulkUnenrolPlayersFromProgram({ programId, playerIds: ids })
      if (r.error) {
        setFeedback({ kind: 'error', message: r.error })
        return
      }
      const s = r.summary!
      const parts = [
        s.unenrolled ? `${s.unenrolled} unenrolled` : null,
        s.skipped ? `${s.skipped} skipped (not term-enrolled)` : null,
        s.chargesVoided ? `${s.chargesVoided} future charges voided` : null,
        s.failed.length ? `${s.failed.length} failed` : null,
      ].filter(Boolean).join(' · ') || 'No changes'
      setFeedback({ kind: s.failed.length > 0 && s.unenrolled === 0 ? 'error' : 'success', message: parts })
      clearSelection()
      router.refresh()
    })
  }

  function onBulkDelete(cascade: boolean) {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const confirmMsg = cascade
      ? `Wipe ALL data for ${ids.length} selected player${ids.length === 1 ? '' : 's'} on this program? Voids every charge and deletes attendances + bookings + lesson notes. Cannot be undone.`
      : `Hard-delete ${ids.length} selected player${ids.length === 1 ? '' : 's'} from the roster? Players with existing charges/attendances will be skipped (use "Wipe all" if you want to nuke them).`
    if (!confirm(confirmMsg)) return
    setFeedback(null)
    startTransition(async () => {
      const r = await bulkDeleteProgramRosterEntries({ programId, playerIds: ids, cascade })
      if (r.error) {
        setFeedback({ kind: 'error', message: r.error })
        return
      }
      const deleted = r.results.filter(x => x.deleted).length
      const blocked = r.results.filter(x => x.blocked).length
      const failed = r.results.filter(x => x.error).length
      const parts = [
        deleted ? `${deleted} deleted` : null,
        blocked ? `${blocked} blocked (have dependents)` : null,
        failed ? `${failed} failed` : null,
      ].filter(Boolean).join(' · ') || 'No changes'
      setFeedback({ kind: deleted > 0 ? 'success' : 'error', message: parts })
      clearSelection()
      router.refresh()
    })
  }

  const allSelected = roster.length > 0 && selected.size === roster.length
  const someSelected = selected.size > 0 && !allSelected

  return (
    <div className="mt-4 space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="text-sm">
            <span className="font-medium text-primary">{selected.size} selected</span>
            <button type="button" onClick={clearSelection} className="ml-2 text-xs text-muted-foreground hover:text-foreground hover:underline">
              Clear
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBulkUnenrol}
              disabled={isPending || termSelectedIds().length === 0}
              className="gap-1.5"
              title="Unenrols only currently term-enrolled players in the selection"
            >
              <UserMinus className="size-3.5" /> Unenrol selected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onBulkDelete(false)}
              disabled={isPending}
              className="gap-1.5 border-danger/30 text-danger hover:bg-danger/10 hover:text-danger hover:border-danger/50"
            >
              <Trash2 className="size-3.5" /> Delete clean
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onBulkDelete(true)}
              disabled={isPending}
              className="gap-1.5"
            >
              <AlertTriangle className="size-3.5" /> Wipe all data
            </Button>
            {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
            feedback.kind === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected }}
                  onChange={() => allSelected ? clearSelection() : selectAll()}
                  className="size-4 rounded border-border accent-primary"
                />
              </TableHead>
              <TableHead className="w-8" />
              <TableHead>Player</TableHead>
              <TableHead>Family</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map((r) => {
              const isExpanded = expandedId === r.playerId
              const totals = attendanceTotals[r.playerId]
              const totalMarked = totals ? totals.present + totals.absent + totals.noshow : 0
              const rate = totalMarked > 0 ? Math.round((totals.present / totalMarked) * 100) : null
              const notes = latestNotes[r.playerId]
              const isSelected = selected.has(r.playerId)
              const blockState = rowDeleteState[r.playerId]
              const canUnenrol = r.type === 'term'
              const hasContactInfo = r.primaryContact.phone || r.primaryContact.email || r.secondaryContact

              return (
                <>
                  <TableRow
                    key={r.playerId}
                    className={cn(
                      isExpanded ? 'bg-muted/30' : '',
                      isSelected ? 'bg-primary/5' : '',
                    )}
                  >
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.firstName} ${r.lastName}`}
                        checked={isSelected}
                        onChange={() => togglePlayer(r.playerId)}
                        className="size-4 rounded border-border accent-primary"
                      />
                    </TableCell>
                    <TableCell
                      className="w-8 cursor-pointer px-2"
                      onClick={() => setExpandedId(isExpanded ? null : r.playerId)}
                    >
                      {isExpanded
                        ? <ChevronDown className="size-3.5 text-muted-foreground" />
                        : <ChevronRight className="size-3.5 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.familyId ? (
                        <PlayerPill
                          familyId={r.familyId}
                          playerId={r.playerId}
                          name={`${r.firstName} ${r.lastName}`}
                        />
                      ) : (
                        <span>{r.firstName} {r.lastName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.familyId && r.familyName ? (
                        <FamilyPill
                          familyId={r.familyId}
                          displayId={r.familyDisplayId}
                          familyName={r.familyName}
                        />
                      ) : '-'}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {r.classifications.length > 0 ? r.classifications.join(' / ') : '-'}
                    </TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', TYPE_STYLES[r.type])}>
                        {TYPE_LABEL[r.type]}
                        {r.type === 'term' && r.nonTermBookingCount ? (
                          <span className="text-[10px] opacity-70">+{r.nonTermBookingCount}</span>
                        ) : null}
                        {(r.type === 'casual' || r.type === 'trial') && r.nonTermBookingCount && r.nonTermBookingCount > 1 ? (
                          <span className="text-[10px] opacity-70">×{r.nonTermBookingCount}</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {canUnenrol && (
                          <button
                            type="button"
                            onClick={() => onUnenrolOne(r)}
                            disabled={isPending}
                            title="Unenrol (status → withdrawn; voids future charges)"
                            className="rounded-md border border-warning/30 bg-warning/5 p-1.5 text-warning hover:bg-warning/10 disabled:opacity-50"
                          >
                            <UserMinus className="size-3.5" />
                          </button>
                        )}
                        {!blockState ? (
                          <button
                            type="button"
                            onClick={() => onDeleteOne(r, false)}
                            disabled={isPending}
                            title="Hard-delete (refuses if any charges/attendances/bookings exist)"
                            className="rounded-md border border-danger/30 bg-danger/5 p-1.5 text-danger hover:bg-danger/10 disabled:opacity-50"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDeleteOne(r, true)}
                            disabled={isPending}
                            title={`Wipe ${blockState.total} dependent items`}
                            className="rounded-md bg-danger px-2 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
                          >
                            Wipe ({blockState.total})
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${r.playerId}-detail`} className="bg-muted/20 hover:bg-muted/20">
                      <TableCell />
                      <TableCell />
                      <TableCell colSpan={5}>
                        <div className="space-y-2 py-1 text-sm">
                          {hasContactInfo && (
                            <div className="space-y-1.5 rounded-md border border-border bg-card/40 p-3">
                              <div className="text-xs font-semibold text-muted-foreground">Contact</div>
                              <ContactBlock
                                label={r.primaryContact.name ?? 'Primary'}
                                phone={r.primaryContact.phone}
                                email={r.primaryContact.email}
                              />
                              {r.secondaryContact && (r.secondaryContact.name || r.secondaryContact.phone || r.secondaryContact.email) && (
                                <ContactBlock
                                  label={r.secondaryContact.name ?? 'Secondary'}
                                  phone={r.secondaryContact.phone}
                                  email={r.secondaryContact.email}
                                />
                              )}
                            </div>
                          )}

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
                          {blockState && (
                            <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
                              <div className="font-semibold text-warning flex items-center gap-1.5">
                                <AlertTriangle className="size-3.5" /> Hard-delete blocked
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                Player has dependents: {Object.entries(blockState.blockers).map(([k, n]) => `${n} ${k}`).join(', ')}.
                                Click the red “Wipe ({blockState.total})” button on the row to nuke everything (voids charges + deletes attendances/bookings/notes + recalcs balance).
                              </div>
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
    </div>
  )
}

function ContactBlock({ label, phone, email }: { label: string; phone: string | null; email: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      {phone && (
        <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
          <Phone className="size-3" /> {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
          <Mail className="size-3" /> {email}
        </a>
      )}
      {!phone && !email && (
        <span className="text-muted-foreground italic">no contact details</span>
      )}
    </div>
  )
}
