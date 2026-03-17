'use client'

import { coachUpdateAttendance } from '../../actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Player = { id: string; first_name: string; last_name: string; ball_color: string | null }

export function CoachAttendanceForm({
  sessionId,
  roster,
  attendanceMap,
}: {
  sessionId: string
  roster: Player[]
  attendanceMap: Record<string, string>
}) {
  const action = coachUpdateAttendance.bind(null, sessionId)

  return (
    <form action={action} className="mt-3">
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {roster.map((player) => (
              <div key={player.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                <span className="text-sm text-foreground">
                  {player.first_name} {player.last_name}
                  {player.ball_color && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary capitalize">
                      {player.ball_color}
                    </span>
                  )}
                </span>
                <select
                  name={`attendance_${player.id}`}
                  defaultValue={attendanceMap[player.id] ?? 'present'}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="excused">Excused</option>
                </select>
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
