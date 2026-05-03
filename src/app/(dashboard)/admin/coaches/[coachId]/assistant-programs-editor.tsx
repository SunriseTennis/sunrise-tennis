'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GraduationCap, Plus, X } from 'lucide-react'
import { formatTime } from '@/lib/utils/dates'
import { assignCoachAsAssistant, unassignCoachFromProgram } from '../actions'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Assignment = {
  programId: string
  name: string
  type: string
  day: number | null
  startTime: string | null
  endTime: string | null
  status: string
  role: string
}

type Available = {
  id: string
  name: string
  type: string
  day: number | null
  startTime: string | null
}

export function AssistantProgramsEditor({
  coachId,
  currentAssignments,
  availableToAssist,
}: {
  coachId: string
  currentAssignments: Assignment[]
  availableToAssist: Available[]
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function onAssign() {
    if (!selectedProgramId) return
    const fd = new FormData()
    fd.set('coach_id', coachId)
    fd.set('program_id', selectedProgramId)
    startTransition(async () => {
      await assignCoachAsAssistant(fd)
      router.refresh()
      setPickerOpen(false)
      setSelectedProgramId('')
    })
  }

  function onRemove(programId: string) {
    if (!confirm('Remove this coach from this program?')) return
    const fd = new FormData()
    fd.set('coach_id', coachId)
    fd.set('program_id', programId)
    startTransition(async () => {
      await unassignCoachFromProgram(fd)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <GraduationCap className="size-4" /> Assigned Programs
          </h2>
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10"
          >
            <Plus className="size-3" /> Assign as assistant
          </button>
        </div>

        {pickerOpen && (
          <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Pick a program to assist on</p>
            <select
              value={selectedProgramId}
              onChange={e => setSelectedProgramId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— select program —</option>
              {availableToAssist.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.day != null ? ` (${DAY_NAMES[p.day]}${p.startTime ? ' ' + formatTime(p.startTime) : ''})` : ''}
                  {' · '}{p.type}
                </option>
              ))}
            </select>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setPickerOpen(false); setSelectedProgramId('') }}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/50"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={onAssign}
                disabled={!selectedProgramId || isPending}
                size="sm"
              >
                {isPending ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
          </div>
        )}

        {currentAssignments.length > 0 ? (
          <div className="space-y-2">
            {currentAssignments.map(a => (
              <div key={a.programId} className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Link href={`/admin/programs/${a.programId}`} className="flex-1 min-w-0 transition-colors hover:text-primary">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.day != null ? DAY_NAMES[a.day] : ''}
                    {a.startTime && ` ${formatTime(a.startTime)}`}
                    {a.endTime && ` - ${formatTime(a.endTime)}`}
                    {' · '}{a.type}
                    {a.role === 'primary' ? ' · Lead' : ' · Assistant'}
                  </p>
                </Link>
                <span className={`text-xs ${a.status === 'active' ? 'text-success' : 'text-muted-foreground'}`}>
                  {a.status}
                </span>
                {a.role !== 'primary' && (
                  <button
                    type="button"
                    onClick={() => onRemove(a.programId)}
                    disabled={isPending}
                    className="rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    aria-label="Remove from program"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Lead-coach role is changed from the program detail page (one source of truth).
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not assigned to any programs</p>
        )}
      </CardContent>
    </Card>
  )
}
