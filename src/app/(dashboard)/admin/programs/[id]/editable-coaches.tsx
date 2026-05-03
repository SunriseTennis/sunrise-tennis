'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, X } from 'lucide-react'
import {
  setProgramLeadCoach,
  addProgramAssistantCoach,
  removeProgramAssistantCoach,
} from '../../actions'

type CoachOption = { id: string; name: string }

type Assignment = {
  programCoachId: string
  coachId: string
  coachName: string
  role: string
}

export function EditableCoaches({
  programId,
  leadCoach,
  assistants,
  allActiveCoaches,
}: {
  programId: string
  leadCoach: { coachId: string; coachName: string } | null
  assistants: Assignment[]
  allActiveCoaches: CoachOption[]
}) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedAssistant, setSelectedAssistant] = useState('')
  const [isPending, startTransition] = useTransition()

  function onLeadChange(newCoachId: string) {
    if (newCoachId === (leadCoach?.coachId ?? '')) return
    const fd = new FormData()
    fd.set('program_id', programId)
    fd.set('coach_id', newCoachId)
    startTransition(async () => {
      await setProgramLeadCoach(fd)
      router.refresh()
    })
  }

  function onAddAssistant() {
    if (!selectedAssistant) return
    const fd = new FormData()
    fd.set('program_id', programId)
    fd.set('coach_id', selectedAssistant)
    startTransition(async () => {
      await addProgramAssistantCoach(fd)
      router.refresh()
      setPickerOpen(false)
      setSelectedAssistant('')
    })
  }

  function onRemoveAssistant(coachId: string) {
    if (!confirm('Remove this assistant from the program?')) return
    const fd = new FormData()
    fd.set('program_id', programId)
    fd.set('coach_id', coachId)
    startTransition(async () => {
      await removeProgramAssistantCoach(fd)
      router.refresh()
    })
  }

  const assistantIds = new Set(assistants.map(a => a.coachId))
  const eligibleForLead = allActiveCoaches
  const eligibleForAssistant = allActiveCoaches.filter(c =>
    c.id !== (leadCoach?.coachId ?? '') && !assistantIds.has(c.id)
  )

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-foreground">Coaches</h2>

        <div className="mt-4 space-y-4">
          {/* Lead coach picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Lead coach</label>
            <select
              value={leadCoach?.coachId ?? ''}
              onChange={(e) => onLeadChange(e.target.value)}
              disabled={isPending}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">— no lead coach —</option>
              {eligibleForLead.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {leadCoach && (
              <Link
                href={`/admin/coaches/${leadCoach.coachId}`}
                className="mt-1 inline-block text-xs text-primary hover:underline"
              >
                View {leadCoach.coachName}
              </Link>
            )}
          </div>

          {/* Assistants */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Assistants</label>
              <button
                type="button"
                onClick={() => setPickerOpen(o => !o)}
                disabled={eligibleForAssistant.length === 0}
                className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-40"
              >
                <Plus className="size-3" /> Add assistant
              </button>
            </div>

            {pickerOpen && (
              <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                <select
                  value={selectedAssistant}
                  onChange={(e) => setSelectedAssistant(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">— select coach —</option>
                  {eligibleForAssistant.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setPickerOpen(false); setSelectedAssistant('') }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onAddAssistant}
                    disabled={!selectedAssistant || isPending}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {isPending ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-2 space-y-2">
              {assistants.length === 0 ? (
                <p className="text-xs text-muted-foreground">No assistants assigned.</p>
              ) : (
                assistants.map(a => (
                  <div key={a.programCoachId} className="flex items-center gap-2 rounded-lg border border-border p-2">
                    <Link href={`/admin/coaches/${a.coachId}`} className="flex-1 text-sm font-medium hover:text-primary transition-colors">
                      {a.coachName}
                    </Link>
                    <button
                      type="button"
                      onClick={() => onRemoveAssistant(a.coachId)}
                      disabled={isPending}
                      className="rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      aria-label="Remove assistant"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
