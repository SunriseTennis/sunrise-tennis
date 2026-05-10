'use client'

import { useState } from 'react'
import { coachUpdateAttendance } from '../../actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, X, AlertTriangle } from 'lucide-react'

type Player = { id: string; first_name: string; last_name: string; classifications: string[] | null }

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present', icon: Check, style: 'bg-success/15 text-success border-success/30', activeStyle: 'bg-success text-white border-success shadow-sm' },
  { value: 'absent', label: 'Absent', icon: X, style: 'bg-muted text-muted-foreground border-border', activeStyle: 'bg-amber-500 text-white border-amber-500 shadow-sm' },
  { value: 'noshow', label: 'No Show', icon: AlertTriangle, style: 'bg-muted text-muted-foreground border-border', activeStyle: 'bg-danger text-white border-danger shadow-sm' },
] as const

export function CoachAttendanceForm({
  sessionId,
  roster,
  attendanceMap,
}: {
  sessionId: string
  roster: Player[]
  attendanceMap: Record<string, string>
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const player of roster) {
      initial[player.id] = attendanceMap[player.id] ?? 'present'
    }
    return initial
  })

  const action = coachUpdateAttendance.bind(null, sessionId)

  return (
    <form action={action} className="mt-3">
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {roster.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-2 border-b border-border py-2.5 last:border-0">
                <span className="text-sm text-foreground min-w-0">
                  {player.first_name} {player.last_name}
                  {(player.classifications ?? []).length > 0 && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary capitalize">
                      {(player.classifications ?? []).join(' / ')}
                    </span>
                  )}
                </span>
                <input type="hidden" name={`attendance_${player.id}`} value={statuses[player.id]} />
                <div className="flex gap-1 shrink-0">
                  {STATUS_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    const isActive = statuses[player.id] === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setStatuses(prev => ({ ...prev, [player.id]: opt.value }))}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all ${
                          isActive ? opt.activeStyle : opt.style
                        }`}
                        title={opt.label}
                      >
                        <Icon className="size-3" />
                        <span className="hidden sm:inline">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button type="submit">Save Attendance</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
