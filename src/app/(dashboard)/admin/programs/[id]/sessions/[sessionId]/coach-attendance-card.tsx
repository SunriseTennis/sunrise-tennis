'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X, GraduationCap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InlineSegmented } from '@/components/inline-edit/inline-segmented'
import { CoachPill } from '@/components/admin/entity-pills'
import {
  setSessionCoachAttendance,
  removeSessionCoachAttendance,
} from '../../../../actions'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/currency'
import { calculateGroupCoachPay } from '@/lib/utils/billing'

type CoachStatus = 'present' | 'absent' | 'partial'

interface CoachRow {
  id: string
  name: string
  /** 'primary' / 'assistant' / 'sub' / null */
  role: string | null
  /** 'sub' rows can be removed; program coaches stay always-visible. */
  isSub: boolean
  rateCents: number | null
  isOwner: boolean
}

interface AttendanceMap {
  [coachId: string]: { status: CoachStatus; actual_minutes: number | null; note: string | null }
}

const STATUS_OPTIONS: { value: CoachStatus; label: string; tone: 'success' | 'warning' | 'danger' }[] = [
  { value: 'present', label: 'Present', tone: 'success' },
  { value: 'partial', label: 'Partial', tone: 'warning' },
  { value: 'absent',  label: 'Absent',  tone: 'danger'  },
]

const QUICK_PRESETS = [
  { label: '15 min', delta: 15 },
  { label: '30 min', delta: 30 },
  { label: '45 min', delta: 45 },
]

export function CoachAttendanceCard({
  sessionId,
  programId,
  durationMin,
  initialCoaches,
  initialAttendance,
  candidateSubCoaches,
}: {
  sessionId: string
  programId: string
  durationMin: number
  initialCoaches: CoachRow[]
  initialAttendance: AttendanceMap
  /** All active coaches NOT already on the session — for the sub picker. */
  candidateSubCoaches: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [coaches, setCoaches] = useState<CoachRow[]>(initialCoaches)
  const [att, setAtt] = useState<AttendanceMap>(initialAttendance)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const coachIdsOnSession = useMemo(() => new Set(coaches.map(c => c.id)), [coaches])

  const subMatches = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return [] as { id: string; name: string }[]
    return candidateSubCoaches
      .filter(c => !coachIdsOnSession.has(c.id))
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [pickerSearch, candidateSubCoaches, coachIdsOnSession])

  function rowFor(coachId: string): { status: CoachStatus; actual_minutes: number; note: string } {
    const a = att[coachId]
    if (!a) return { status: 'present', actual_minutes: durationMin, note: '' }
    return {
      status: a.status,
      actual_minutes: a.actual_minutes ?? durationMin,
      note: a.note ?? '',
    }
  }

  function payFor(coach: CoachRow, status: CoachStatus, minutes: number) {
    if (coach.isOwner || !coach.rateCents) return null
    const eff = status === 'absent' ? 0 : status === 'partial' ? Math.max(0, Math.min(minutes, durationMin)) : durationMin
    return calculateGroupCoachPay(coach.rateCents, eff)
  }

  function patchAtt(coachId: string, patch: Partial<{ status: CoachStatus; actual_minutes: number; note: string }>) {
    setAtt(prev => {
      const cur = prev[coachId] ?? { status: 'present' as CoachStatus, actual_minutes: durationMin, note: '' }
      return {
        ...prev,
        [coachId]: {
          status: patch.status ?? cur.status,
          actual_minutes: patch.actual_minutes !== undefined ? patch.actual_minutes : cur.actual_minutes,
          note: patch.note !== undefined ? patch.note : cur.note,
        },
      }
    })
  }

  function persist(coachId: string) {
    const r = rowFor(coachId)
    setError(null)
    startTransition(async () => {
      const res = await setSessionCoachAttendance({
        sessionId,
        coachId,
        programId,
        status: r.status,
        actualMinutes: r.status === 'partial' ? r.actual_minutes : null,
        note: r.note || null,
      })
      if (res.error) setError(res.error)
      router.refresh()
    })
  }

  function changeStatus(coach: CoachRow, next: CoachStatus) {
    const cur = rowFor(coach.id)
    const minutes = next === 'partial' && cur.status !== 'partial'
      ? Math.max(0, durationMin - 30)
      : cur.actual_minutes
    patchAtt(coach.id, { status: next, actual_minutes: minutes })
    setAtt(prev => {
      const updated: AttendanceMap = {
        ...prev,
        [coach.id]: { status: next, actual_minutes: next === 'partial' ? minutes : (next === 'absent' ? 0 : null), note: prev[coach.id]?.note ?? null },
      }
      startTransition(async () => {
        const res = await setSessionCoachAttendance({
          sessionId,
          coachId: coach.id,
          programId,
          status: next,
          actualMinutes: next === 'partial' ? minutes : null,
          note: prev[coach.id]?.note ?? null,
        })
        if (res.error) setError(res.error)
        router.refresh()
      })
      return updated
    })
  }

  function changeMinutes(coach: CoachRow, next: number) {
    const clamped = Math.max(0, Math.min(next, durationMin))
    patchAtt(coach.id, { actual_minutes: clamped })
  }

  function changeNote(coach: CoachRow, next: string) {
    patchAtt(coach.id, { note: next })
  }

  function addSub(coachId: string) {
    const sub = candidateSubCoaches.find(c => c.id === coachId)
    if (!sub) return
    setCoaches(prev => [...prev, { id: sub.id, name: sub.name, role: 'sub', isSub: true, rateCents: null, isOwner: false }])
    setPickerSearch('')
    setPickerOpen(false)
    startTransition(async () => {
      const res = await setSessionCoachAttendance({
        sessionId,
        coachId,
        programId,
        status: 'present',
        actualMinutes: null,
        note: null,
      })
      if (res.error) setError(res.error)
      router.refresh()
    })
  }

  function removeSub(coach: CoachRow) {
    if (!coach.isSub) return
    setCoaches(prev => prev.filter(c => c.id !== coach.id))
    setAtt(prev => {
      const next = { ...prev }
      delete next[coach.id]
      return next
    })
    startTransition(async () => {
      const res = await removeSessionCoachAttendance({ sessionId, coachId: coach.id, programId })
      if (res.error) setError(res.error)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <GraduationCap className="size-5 text-primary" /> Coach attendance
          </h2>
          <div className="text-xs text-muted-foreground">
            {isPending && <span className="flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Saving…</span>}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Captures who actually coached. Drives this session’s coach pay across admin and coach views.
        </p>

        {error && (
          <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {coaches.map((coach) => {
            const r = rowFor(coach.id)
            const pay = payFor(coach, r.status, r.actual_minutes)
            const fullPay = !coach.isOwner && coach.rateCents ? calculateGroupCoachPay(coach.rateCents, durationMin) : null
            return (
              <div key={coach.id} className={cn(
                'rounded-lg border bg-card/40 px-3 py-2.5 transition-colors',
                r.status !== 'present' ? 'border-warning/30 bg-warning/5' : 'border-border',
              )}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <CoachPill coachId={coach.id} name={coach.name} role={coach.role} size="md" />
                    {coach.isSub && (
                      <span className="rounded-full bg-secondary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">sub</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <InlineSegmented
                      value={r.status}
                      options={STATUS_OPTIONS}
                      onChange={(next) => changeStatus(coach, next as CoachStatus)}
                      size="sm"
                    />
                    {coach.isSub && (
                      <button
                        type="button"
                        onClick={() => removeSub(coach)}
                        title="Remove sub"
                        className="rounded-md border border-border bg-background p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-colors"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {r.status === 'partial' && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Worked</span>
                      <button
                        type="button"
                        onClick={() => { changeMinutes(coach, r.actual_minutes - 5); }}
                        onPointerUp={() => persist(coach.id)}
                        className="rounded-md border border-border bg-background px-2 py-1 text-foreground hover:bg-muted/60 transition-colors"
                        aria-label="Decrease 5 min"
                      >−</button>
                      <input
                        type="number"
                        min={0}
                        max={durationMin}
                        value={r.actual_minutes}
                        onChange={(e) => changeMinutes(coach, parseInt(e.target.value, 10) || 0)}
                        onBlur={() => persist(coach.id)}
                        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-center tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => { changeMinutes(coach, r.actual_minutes + 5); }}
                        onPointerUp={() => persist(coach.id)}
                        className="rounded-md border border-border bg-background px-2 py-1 text-foreground hover:bg-muted/60 transition-colors"
                        aria-label="Increase 5 min"
                      >+</button>
                      <span className="text-muted-foreground">of {durationMin} min</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground mr-1">Quick:</span>
                      {QUICK_PRESETS.map(p => (
                        <button
                          key={`late-${p.delta}`}
                          type="button"
                          onClick={() => { changeMinutes(coach, durationMin - p.delta); persist(coach.id) }}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                          title={`Came ${p.label} late → worked ${durationMin - p.delta} min`}
                        >Late {p.label}</button>
                      ))}
                      {QUICK_PRESETS.map(p => (
                        <button
                          key={`early-${p.delta}`}
                          type="button"
                          onClick={() => { changeMinutes(coach, durationMin - p.delta); persist(coach.id) }}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                          title={`Left ${p.label} early → worked ${durationMin - p.delta} min`}
                        >Left {p.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {r.status === 'partial' && (
                  <div className="mt-2">
                    <Label htmlFor={`note-${coach.id}`} className="text-xs text-muted-foreground">Note (optional)</Label>
                    <Input
                      id={`note-${coach.id}`}
                      type="text"
                      value={r.note}
                      onChange={(e) => changeNote(coach, e.target.value)}
                      onBlur={() => persist(coach.id)}
                      placeholder='e.g. "out for private 4:15-4:45"'
                      className="mt-1"
                      maxLength={500}
                    />
                  </div>
                )}

                {fullPay !== null && (
                  <div className="mt-2 flex items-baseline justify-end gap-2 text-xs">
                    <span className="text-muted-foreground">Pay</span>
                    {pay !== null && pay !== fullPay ? (
                      <>
                        <span className="text-muted-foreground line-through tabular-nums">{formatCurrency(fullPay)}</span>
                        <span className="font-semibold tabular-nums text-foreground">{formatCurrency(pay)}</span>
                      </>
                    ) : (
                      <span className="font-semibold tabular-nums text-foreground">{formatCurrency(pay ?? fullPay)}</span>
                    )}
                  </div>
                )}
                {coach.isOwner && (
                  <div className="mt-2 text-xs text-muted-foreground">Owner — not paid per session</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Sub-coach picker */}
        <div className="mt-4 border-t border-border pt-4">
          {!pickerOpen ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-sm text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              <Plus className="size-3.5" /> Add coach to this session
            </button>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <Label htmlFor="sub-search">Add a sub coach (one-off)</Label>
                  <Input
                    id="sub-search"
                    type="text"
                    className="mt-1"
                    placeholder="Search coach by name…"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setPickerOpen(false); setPickerSearch('') }}
                  className="mt-6 rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Cancel"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {subMatches.length > 0 && (
                <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border bg-card">
                  {subMatches.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addSub(c.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors"
                    >
                      <span className="font-medium">{c.name}</span>
                      <Plus className="size-3.5 shrink-0 text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
