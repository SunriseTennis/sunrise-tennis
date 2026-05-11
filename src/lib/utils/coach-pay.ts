import { calculateGroupCoachPay } from './billing'

export type SessionCoachAttendance = {
  status: 'present' | 'absent' | 'partial'
  actual_minutes: number | null
  note?: string | null
}

/**
 * Single source of truth for per-session group-coach pay derivation.
 * Honours `session_coach_attendances`:
 *   - no row              → treated as Present, full session pay
 *   - status='present'    → full session pay
 *   - status='partial'    → pro-rata on actual_minutes (NULL = full)
 *   - status='absent'     → 0
 *
 * Coach pay for groups is derived (not persisted via coach_earnings — that
 * table is private-only). Every reader page (admin overview, /admin/coaches,
 * /admin/coaches/[coachId], program detail, session detail) must call this
 * helper with its session attendance map so the displayed pay agrees across
 * pages.
 */
export function deriveSessionCoachPay({
  rateCents,
  durationMin,
  attendance,
}: {
  rateCents: number | null | undefined
  durationMin: number
  attendance?: SessionCoachAttendance | null
}): { payCents: number; effectiveMinutes: number; status: SessionCoachAttendance['status'] } {
  const status: SessionCoachAttendance['status'] = attendance?.status ?? 'present'

  let effectiveMinutes: number
  if (status === 'absent') {
    effectiveMinutes = 0
  } else if (status === 'partial') {
    if (attendance?.actual_minutes != null) {
      effectiveMinutes = Math.max(0, Math.min(attendance.actual_minutes, durationMin))
    } else {
      effectiveMinutes = durationMin
    }
  } else {
    effectiveMinutes = durationMin
  }

  const payCents = rateCents ? calculateGroupCoachPay(rateCents, effectiveMinutes) : 0
  return { payCents, effectiveMinutes, status }
}

/**
 * Build a `Map<coachId, SessionCoachAttendance>` for one session.
 */
export function attendanceMapForSession(
  rows: Array<{ coach_id: string; status: string; actual_minutes: number | null; note?: string | null }>
): Map<string, SessionCoachAttendance> {
  const m = new Map<string, SessionCoachAttendance>()
  for (const r of rows) {
    if (r.status === 'present' || r.status === 'absent' || r.status === 'partial') {
      m.set(r.coach_id, {
        status: r.status,
        actual_minutes: r.actual_minutes,
        note: r.note ?? null,
      })
    }
  }
  return m
}

/**
 * Build a `Map<sessionId-coachId, SessionCoachAttendance>` for many sessions.
 * Use `keyForSessionCoach(sessionId, coachId)` to look up.
 */
export function attendanceMapForSessions(
  rows: Array<{ session_id: string; coach_id: string; status: string; actual_minutes: number | null; note?: string | null }>
): Map<string, SessionCoachAttendance> {
  const m = new Map<string, SessionCoachAttendance>()
  for (const r of rows) {
    if (r.status === 'present' || r.status === 'absent' || r.status === 'partial') {
      m.set(`${r.session_id}-${r.coach_id}`, {
        status: r.status,
        actual_minutes: r.actual_minutes,
        note: r.note ?? null,
      })
    }
  }
  return m
}

export function keyForSessionCoach(sessionId: string, coachId: string): string {
  return `${sessionId}-${coachId}`
}

/**
 * Compute session duration in minutes from start/end strings ('HH:MM:SS' or 'HH:MM').
 * Defaults to 60 when either is missing — matches the existing pattern used across
 * admin pages.
 */
export function sessionDurationMin(startTime: string | null, endTime: string | null, fallbackMin = 60): number {
  if (!startTime || !endTime) return fallbackMin
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  if (Number.isNaN(sh) || Number.isNaN(eh)) return fallbackMin
  const mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))
  return mins > 0 ? mins : fallbackMin
}
