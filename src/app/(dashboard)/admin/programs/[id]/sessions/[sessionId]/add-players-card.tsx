'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, CalendarRange, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InlineSegmented } from '@/components/inline-edit/inline-segmented'
import {
  MultiPlayerPicker,
  type PickerFamily,
} from '@/components/admin/multi-player-picker'
import { bulkAddWalkInAttendance, bulkEnrolPlayers } from '../../../../actions'

type Mode = 'walkin' | 'term'

export function AddPlayersCard({
  sessionId,
  programId,
  programLevel,
  families,
  walkInExcludedIds,
  termExcludedIds,
  futureSessionCount,
}: {
  sessionId: string
  programId: string
  programLevel: string | null
  families: PickerFamily[]
  /** Players already on this session's attendance — excluded from walk-in mode. */
  walkInExcludedIds: string[]
  /** Players already enrolled in the program — excluded from term-enrol mode. */
  termExcludedIds: string[]
  /** How many future sessions exist for this program — drives the "X future sessions" preview. */
  futureSessionCount: number
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('walkin')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const excluded = mode === 'walkin' ? walkInExcludedIds : termExcludedIds
  const submitDisabled = isPending || selected.size === 0

  const submitLabel = (() => {
    const n = selected.size
    if (mode === 'walkin') return n === 1 ? 'Add walk-in' : `Add ${n || ''} walk-ins`
    return n === 1 ? 'Enrol for term' : `Enrol ${n || ''} for term`
  })()

  function reset() {
    setSelected(new Set())
    setSearch('')
    setNotes('')
  }

  function submit() {
    if (submitDisabled) return
    setFeedback(null)
    const playerIds = Array.from(selected)
    startTransition(async () => {
      if (mode === 'walkin') {
        const res = await bulkAddWalkInAttendance({ sessionId, programId, playerIds })
        if (res.error) {
          setFeedback({ kind: 'error', message: res.error })
          return
        }
        const s = res.summary!
        const parts: string[] = []
        if (s.added) parts.push(`${s.added} walk-in${s.added === 1 ? '' : 's'} added`)
        if (s.skipped) parts.push(`${s.skipped} already marked`)
        if (s.failed.length) parts.push(`${s.failed.length} failed`)
        setFeedback({ kind: s.failed.length > 0 && s.added === 0 ? 'error' : 'success', message: parts.join(' · ') || 'No changes' })
        if (s.added > 0) reset()
        router.refresh()
      } else {
        // Term enrol uses bulkEnrolPlayers — same path as the program detail page.
        // gatherTermEnrolSessions inside that action absorbs today's walk-in
        // charges into the new term math. return_to_session_id keeps admin on
        // this session page after success (instead of redirecting to program).
        // from_session_id signals the retroactive path: charge from THIS
        // session forward (regardless of past/future), so enroling mid-term
        // from May 4 includes May 4 + every later session, not just
        // future-only. Default behaviour (parent enrol, BulkEnrolForm on the
        // program detail page) doesn't pass from_session_id, so it stays
        // future-only.
        const fd = new FormData()
        fd.set('program_id', programId)
        fd.set('player_ids', JSON.stringify(playerIds))
        fd.set('booking_type', 'term')
        fd.set('return_to_session_id', sessionId)
        fd.set('from_session_id', sessionId)
        if (notes.trim()) fd.set('notes', notes.trim())
        try {
          await bulkEnrolPlayers(fd)
        } catch (e) {
          // bulkEnrolPlayers redirects on success — Next.js throws NEXT_REDIRECT.
          const msg = e instanceof Error ? e.message : ''
          if (!msg.includes('NEXT_REDIRECT')) {
            setFeedback({ kind: 'error', message: 'Term enrol failed' })
            return
          }
        }
        reset()
        router.refresh()
      }
    })
  }

  const willAbsorb = mode === 'term' && Array.from(selected).some(id => walkInExcludedIds.includes(id))

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <UserPlus className="size-5 text-primary" /> Add players
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search any active player. Pick one or many, then choose what to do.
            </p>
          </div>
          <InlineSegmented
            value={mode}
            options={[
              { value: 'walkin', label: 'Walk-in', icon: <UserPlus className="size-3.5" /> },
              { value: 'term',   label: 'Term enrol', icon: <CalendarRange className="size-3.5" /> },
            ]}
            onChange={(next) => { setMode(next as Mode); setSelected(new Set()); setFeedback(null) }}
          />
        </div>

        <div className="mt-4">
          <MultiPlayerPicker
            families={families}
            programLevel={programLevel}
            excludePlayerIds={excluded}
            selected={selected}
            search={search}
            onSelectedChange={setSelected}
            onSearchChange={setSearch}
            emptyMessage={mode === 'walkin' ? 'Everyone is already marked for this session' : 'Everyone is already enrolled'}
          />
        </div>

        {mode === 'term' && (
          <div className="mt-3">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              type="text"
              className="mt-1"
              placeholder="Internal note attached to each booking"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>
        )}

        {mode === 'term' && selected.size > 0 && (
          <p className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary/80">
            Will create term charges for {Math.max(futureSessionCount, 0)} session{futureSessionCount === 1 ? '' : 's'} per player.
            {willAbsorb && ' Today’s walk-in charges for selected players will be absorbed into the term math.'}
          </p>
        )}

        {feedback && (
          <div
            role="status"
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              feedback.kind === 'success'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-danger/30 bg-danger/10 text-danger'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end">
          <Button type="button" onClick={submit} disabled={submitDisabled} className="gap-2">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {submitLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
