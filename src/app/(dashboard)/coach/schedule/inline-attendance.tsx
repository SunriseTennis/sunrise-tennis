'use client'

import { useState, useTransition } from 'react'
import { coachUpdateAttendance } from '../actions'
import { Check, X, AlertTriangle, Loader2 } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import type { CalendarEvent } from '@/components/weekly-calendar'

type Player = { id: string; first_name: string; last_name: string; ball_color: string | null }

const STATUS_OPTIONS = [
  { value: 'present', icon: Check, activeStyle: 'bg-success text-white border-success', inactiveStyle: 'bg-muted/50 text-muted-foreground border-border' },
  { value: 'absent', icon: X, activeStyle: 'bg-amber-500 text-white border-amber-500', inactiveStyle: 'bg-muted/50 text-muted-foreground border-border' },
  { value: 'noshow', icon: AlertTriangle, activeStyle: 'bg-danger text-white border-danger', inactiveStyle: 'bg-muted/50 text-muted-foreground border-border' },
] as const

export function InlineAttendance({
  event,
  roster,
  attendanceMap,
}: {
  event: CalendarEvent
  roster: Player[]
  attendanceMap: Record<string, string>
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const p of roster) {
      initial[p.id] = attendanceMap[p.id] ?? 'present'
    }
    return initial
  })
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function handleSave() {
    if (!event.sessionId) return
    const formData = new FormData()
    for (const [playerId, status] of Object.entries(statuses)) {
      formData.append(`attendance_${playerId}`, status)
    }
    startTransition(async () => {
      await coachUpdateAttendance(event.sessionId!, formData)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className={`rounded-lg border ${event.color ?? 'bg-muted border-border'} p-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{event.title}</p>
          <p className="text-xs text-muted-foreground">
            {event.startTime} - {event.endTime}
            {event.subtitle && <> · {event.subtitle}</>}
          </p>
        </div>
        {event.sessionStatus && <StatusBadge status={event.sessionStatus} />}
      </div>

      {roster.length > 0 && event.sessionStatus !== 'cancelled' && (
        <div className="mt-2 space-y-1">
          {roster.map((player) => (
            <div key={player.id} className="flex items-center justify-between gap-1 py-0.5">
              <span className="text-xs text-foreground truncate min-w-0">
                {player.first_name} {player.last_name?.[0]}.
              </span>
              <div className="flex gap-0.5 shrink-0">
                {STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const isActive = statuses[player.id] === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatuses(prev => ({ ...prev, [player.id]: opt.value }))}
                      className={`flex items-center justify-center rounded border size-5 transition-all ${
                        isActive ? opt.activeStyle : opt.inactiveStyle
                      }`}
                    >
                      <Icon className="size-2.5" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="mt-1 w-full rounded-md bg-[#2B5EA7] px-2 py-1 text-xs font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin mx-auto" />
            ) : saved ? (
              'Saved!'
            ) : (
              'Save'
            )}
          </button>
        </div>
      )}

      {roster.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">No roster data</p>
      )}
    </div>
  )
}
