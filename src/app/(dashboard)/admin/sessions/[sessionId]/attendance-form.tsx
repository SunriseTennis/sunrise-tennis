'use client'

import { useState } from 'react'
import { updateAttendance } from '../../actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, X, AlertTriangle } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present', icon: Check, style: 'bg-muted text-muted-foreground border-border', activeStyle: 'bg-success text-white border-success shadow-sm' },
  { value: 'absent', label: 'Absent', icon: X, style: 'bg-muted text-muted-foreground border-border', activeStyle: 'bg-amber-500 text-white border-amber-500 shadow-sm' },
  { value: 'noshow', label: 'No Show', icon: AlertTriangle, style: 'bg-muted text-muted-foreground border-border', activeStyle: 'bg-danger text-white border-danger shadow-sm' },
] as const

export function AttendanceForm({
  sessionId,
  players,
  attendanceMap,
}: {
  sessionId: string
  players: { id: string; first_name: string; last_name: string }[]
  attendanceMap: Record<string, string>
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const player of players) {
      initial[player.id] = attendanceMap[player.id] ?? 'present'
    }
    return initial
  })

  const updateWithSession = async (fd: FormData) => { await updateAttendance(sessionId, fd) }

  return (
    <Card>
      <CardContent>
        <form action={updateWithSession}>
          <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mark attendance for each player on the roster.</p>

          <div className="mt-4 space-y-3">
            {players.map((player) => (
              <div key={player.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <span className="text-sm font-medium text-foreground">
                  {player.first_name} {player.last_name}
                </span>
                <input type="hidden" name={`attendance_${player.id}`} value={statuses[player.id]} />
                <div className="flex gap-1">
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

          <div className="mt-4 flex justify-end">
            <Button type="submit">
              Save attendance
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
