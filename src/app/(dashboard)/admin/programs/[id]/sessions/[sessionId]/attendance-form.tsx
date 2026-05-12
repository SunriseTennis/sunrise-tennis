'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import { updateAttendance } from '../../../../actions'
import { Card, CardContent } from '@/components/ui/card'
import { InlineSegmented } from '@/components/inline-edit/inline-segmented'
import { PlayerPill } from '@/components/admin/entity-pills'
import { cn } from '@/lib/utils/cn'

type AttendanceStatus = 'present' | 'absent' | 'noshow'

const OPTIONS: { value: AttendanceStatus; label: string; tone: 'success' | 'warning' | 'danger' }[] = [
  { value: 'present', label: 'Present', tone: 'success' },
  { value: 'absent',  label: 'Absent',  tone: 'warning' },
  { value: 'noshow',  label: 'No-show', tone: 'danger'  },
]

const AUTOSAVE_DELAY_MS = 800

export function AttendanceForm({
  sessionId,
  players,
  attendanceMap,
  silent = false,
}: {
  sessionId: string
  programId: string
  players: { id: string; first_name: string; last_name: string; family_id: string; isWalkIn?: boolean }[]
  attendanceMap: Record<string, AttendanceStatus>
  /** When true, skip updateAttendance's built-in redirect so a caller embedded
   *  in a modal (e.g. <ManageSessionModal>) stays on its current page. */
  silent?: boolean
}) {
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, AttendanceStatus>>(() => {
    const seed: Record<string, AttendanceStatus> = {}
    for (const p of players) seed[p.id] = (attendanceMap[p.id] as AttendanceStatus) ?? 'present'
    return seed
  })
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs mirror the latest state so the debounced flush isn't bitten by the
  // stale closure that captures `dirty` / `local` at click time (before the
  // matching setState has applied) — a single click would otherwise schedule
  // a flush whose captured `dirty` is still empty and short-circuit, losing
  // the click entirely. In a multi-click burst the LAST click would always
  // be dropped (its setDirty hadn't applied when the timer-bound flush
  // captured `dirty`).
  const dirtyRef = useRef<Set<string>>(new Set())
  const localRef = useRef<Record<string, AttendanceStatus>>({})
  useEffect(() => { localRef.current = local }, [local])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function pick(playerId: string, next: AttendanceStatus) {
    setLocal(prev => {
      const updated = { ...prev, [playerId]: next }
      localRef.current = updated
      return updated
    })
    dirtyRef.current.add(playerId)
    setDirty(new Set(dirtyRef.current))
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flush(), AUTOSAVE_DELAY_MS)
  }

  function flush() {
    const playersToSubmit = Array.from(dirtyRef.current)
    if (playersToSubmit.length === 0) return
    dirtyRef.current = new Set()
    startTransition(async () => {
      const fd = new FormData()
      for (const pid of playersToSubmit) fd.append(`attendance_${pid}`, localRef.current[pid])
      try {
        await updateAttendance(sessionId, fd, silent ? { silent: true } : undefined)
      } catch (e) {
        // updateAttendance redirects on success when not silent — Next throws a
        // NEXT_REDIRECT error that bubbles here. Treat it as success.
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('NEXT_REDIRECT')) {
          console.error('attendance save failed', e)
        }
      }
      setDirty(new Set())
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  function saveNow() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    flush()
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isPending ? (
              <span className="flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Saving…</span>
            ) : dirty.size > 0 ? (
              <button
                type="button"
                onClick={saveNow}
                className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-medium text-primary hover:bg-primary/15 transition-colors"
              >
                Save {dirty.size} change{dirty.size === 1 ? '' : 's'} now
              </button>
            ) : savedAt ? (
              <span className="flex items-center gap-1 text-success"><Check className="size-3" /> Saved</span>
            ) : (
              <span>Auto-saves on change</span>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {players.map((player) => {
            const status = local[player.id] ?? 'present'
            const isDirty = dirty.has(player.id)
            return (
              <div
                key={player.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/40 px-3 py-2 transition-colors',
                  isDirty ? 'border-primary/30 bg-primary/5' : 'border-border',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PlayerPill
                    familyId={player.family_id}
                    playerId={player.id}
                    name={`${player.first_name} ${player.last_name}`}
                    size="md"
                  />
                  {player.isWalkIn && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      walk-in
                    </span>
                  )}
                </div>
                <InlineSegmented
                  value={status}
                  options={OPTIONS}
                  onChange={(next) => pick(player.id, next)}
                  size="sm"
                />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
