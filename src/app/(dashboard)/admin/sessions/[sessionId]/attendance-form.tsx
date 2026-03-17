'use client'

import { updateAttendance } from '../../actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const selectClass = 'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export function AttendanceForm({
  sessionId,
  players,
  attendanceMap,
}: {
  sessionId: string
  players: { id: string; first_name: string; last_name: string }[]
  attendanceMap: Record<string, string>
}) {
  const updateWithSession = updateAttendance.bind(null, sessionId)

  return (
    <Card>
      <CardContent>
        <form action={updateWithSession}>
          <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mark attendance for each player on the roster.</p>

          <div className="mt-4 space-y-3">
            {players.map((player) => {
              const current = attendanceMap[player.id] ?? 'present'
              return (
                <div key={player.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <span className="text-sm font-medium text-foreground">
                    {player.first_name} {player.last_name}
                  </span>
                  <select
                    name={`attendance_${player.id}`}
                    defaultValue={current}
                    className={`${selectClass} py-1.5`}
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                  </select>
                </div>
              )
            })}
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
