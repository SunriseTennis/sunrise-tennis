import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type Supabase = SupabaseClient<Database>

// ── Player-Coach Restrictions ──────────────────────────────────────────

/**
 * Get the list of coach IDs a player is allowed to book with.
 * Empty array means no restrictions (any active coach is allowed).
 */
export async function getAllowedCoaches(
  supabase: Supabase,
  playerId: string,
): Promise<{ coach_id: string; auto_approve: boolean }[]> {
  const { data } = await supabase
    .from('player_allowed_coaches')
    .select('coach_id, auto_approve')
    .eq('player_id', playerId)

  return data ?? []
}

/**
 * Check if a player can book with a specific coach.
 * Returns true if the allowlist is empty (no restrictions) or the coach is in the list.
 */
export async function canPlayerBookCoach(
  supabase: Supabase,
  playerId: string,
  coachId: string,
): Promise<boolean> {
  const allowed = await getAllowedCoaches(supabase, playerId)
  if (allowed.length === 0) return true
  return allowed.some(a => a.coach_id === coachId)
}

/**
 * Check if a player-coach booking should be auto-approved.
 */
export async function isAutoApproved(
  supabase: Supabase,
  playerId: string,
  coachId: string,
): Promise<boolean> {
  const allowed = await getAllowedCoaches(supabase, playerId)
  const entry = allowed.find(a => a.coach_id === coachId)
  return entry?.auto_approve ?? false
}

// ── Pricing ────────────────────────────────────────────────────────────

/**
 * Get the private lesson price in cents for a coach + duration.
 * Pro-rated from hourly rate.
 */
export async function getPrivatePrice(
  supabase: Supabase,
  coachId: string,
  durationMinutes: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('get_private_price', {
    target_coach_id: coachId,
    target_duration_minutes: durationMinutes,
  })

  if (error) {
    console.error('Failed to get private price:', error.message)
    throw new Error('Price calculation failed')
  }

  return data as number
}

/**
 * Calculate coach pay from a lesson price.
 * Formula: 50% of ex-GST amount. GST = 10%.
 */
export function calculateCoachPay(priceCents: number): number {
  return Math.round((priceCents / 1.1) * 0.5)
}

// ── Availability ───────────────────────────────────────────────────────

interface TimeSlot {
  date: string      // YYYY-MM-DD
  startTime: string  // HH:MM
  endTime: string    // HH:MM
}

/**
 * Get available 30-minute slots for a coach within a date range.
 * Computes: recurring windows - exceptions - booked sessions
 */
export async function getAvailableSlots(
  supabase: Supabase,
  coachId: string,
  startDate: string,
  endDate: string,
): Promise<TimeSlot[]> {
  // 1. Get recurring availability windows
  const { data: windows } = await supabase
    .from('coach_availability')
    .select('day_of_week, start_time, end_time')
    .eq('coach_id', coachId)
    .lte('effective_from', endDate)
    .or(`effective_until.is.null,effective_until.gte.${startDate}`)

  if (!windows?.length) return []

  // 2. Get exceptions for this date range
  const { data: exceptions } = await supabase
    .from('coach_availability_exceptions')
    .select('exception_date, start_time, end_time')
    .eq('coach_id', coachId)
    .gte('exception_date', startDate)
    .lte('exception_date', endDate)

  // 3. Get booked sessions (not cancelled) for this coach in range
  const { data: bookedSessions } = await supabase
    .from('sessions')
    .select('date, start_time, end_time')
    .eq('coach_id', coachId)
    .neq('status', 'cancelled')
    .gte('date', startDate)
    .lte('date', endDate)

  // Generate all dates in range
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  const slots: TimeSlot[] = []

  for (const dateStr of dates) {
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay() // Use noon to avoid timezone issues

    // Find matching windows for this day
    const dayWindows = windows.filter(w => w.day_of_week === dayOfWeek)
    if (!dayWindows.length) continue

    // Check for full-day exception
    const dayExceptions = (exceptions ?? []).filter(e => e.exception_date === dateStr)
    const fullDayBlocked = dayExceptions.some(e => !e.start_time && !e.end_time)
    if (fullDayBlocked) continue

    for (const window of dayWindows) {
      // Generate 30-min slots within this window
      const windowStart = timeToMinutes(window.start_time)
      const windowEnd = timeToMinutes(window.end_time)

      for (let slotStart = windowStart; slotStart + 30 <= windowEnd; slotStart += 30) {
        const slotEnd = slotStart + 30
        const startTime = minutesToTime(slotStart)
        const endTime = minutesToTime(slotEnd)

        // Check against partial exceptions
        const blocked = dayExceptions.some(e => {
          if (!e.start_time || !e.end_time) return false
          const excStart = timeToMinutes(e.start_time)
          const excEnd = timeToMinutes(e.end_time)
          return slotStart < excEnd && slotEnd > excStart
        })
        if (blocked) continue

        // Check against booked sessions
        const booked = (bookedSessions ?? []).some(s => {
          if (s.date !== dateStr) return false
          if (!s.start_time || !s.end_time) return false
          const sessStart = timeToMinutes(s.start_time)
          const sessEnd = timeToMinutes(s.end_time)
          return slotStart < sessEnd && slotEnd > sessStart
        })
        if (booked) continue

        slots.push({ date: dateStr, startTime, endTime })
      }
    }
  }

  return slots
}

// ── Booking Constraints ────────────────────────────────────────────────

/**
 * Validate booking timing constraints.
 * - 24hr minimum notice (except for Maxim's sessions)
 * - 3 week maximum advance booking
 */
export function validateBookingConstraints(
  date: string,
  startTime: string,
  isMaximCoach: boolean,
): { valid: boolean; error?: string } {
  const sessionDateTime = new Date(`${date}T${startTime}`)
  const now = new Date()

  // Minimum notice: 24hrs (skip for Maxim)
  if (!isMaximCoach) {
    const hoursUntil = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursUntil < 24) {
      return { valid: false, error: 'Bookings require at least 24 hours notice' }
    }
  }

  // Maximum advance: 3 weeks
  const weeksUntil = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 7)
  if (weeksUntil > 3) {
    return { valid: false, error: 'Bookings can only be made up to 3 weeks in advance' }
  }

  // Must be in the future
  if (sessionDateTime <= now) {
    return { valid: false, error: 'Cannot book sessions in the past' }
  }

  return { valid: true }
}

// ── Pay Period Helpers ─────────────────────────────────────────────────

/**
 * Get the pay period key for a date.
 * Weekly: '2026-W14' (ISO week number)
 * End of term: '2026-T2' (SA school term)
 */
export function getPayPeriodKey(date: Date, payPeriod: string): string {
  const year = date.getFullYear()

  if (payPeriod === 'end_of_term') {
    // Determine SA school term
    const month = date.getMonth() // 0-indexed
    if (month <= 3) return `${year}-T1`
    if (month <= 6) return `${year}-T2`
    if (month <= 8) return `${year}-T3`
    return `${year}-T4`
  }

  // Weekly: ISO week number
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// ── Standing Bookings ──────────────────────────────────────────────────

/**
 * Generate dates for remaining weeks of the current term for a given day of week.
 * Used when creating a standing (recurring) private lesson booking.
 */
export function getStandingDates(
  dayOfWeek: number,
  startDate: string,
): string[] {
  // Import term data inline to avoid circular deps
  const SA_TERMS = [
    { term: 1, year: 2026, start: new Date(2026, 0, 27), end: new Date(2026, 3, 10) },
    { term: 2, year: 2026, start: new Date(2026, 3, 27), end: new Date(2026, 6, 3) },
    { term: 3, year: 2026, start: new Date(2026, 6, 20), end: new Date(2026, 8, 25) },
    { term: 4, year: 2026, start: new Date(2026, 9, 12), end: new Date(2026, 11, 11) },
  ]

  const start = new Date(startDate + 'T12:00:00')
  const currentTerm = SA_TERMS.find(t => start >= t.start && start <= t.end)
  if (!currentTerm) return [] // Not during a term

  const dates: string[] = []
  const cursor = new Date(start)

  // Advance to the next occurrence of dayOfWeek after startDate
  while (cursor.getDay() !== dayOfWeek) {
    cursor.setDate(cursor.getDate() + 1)
  }
  // If we landed on startDate itself, skip to next week (first instance already booked)
  if (cursor.toISOString().split('T')[0] === startDate) {
    cursor.setDate(cursor.getDate() + 7)
  }

  while (cursor <= currentTerm.end) {
    dates.push(cursor.toISOString().split('T')[0])
    cursor.setDate(cursor.getDate() + 7)
  }

  return dates
}

// ── Freed Slot Notification ────────────────────────────────────────────

/**
 * Get user IDs of parents whose players can book with a given coach.
 * Used to notify eligible families when a standing slot is freed.
 */
export async function getEligibleParentUserIds(
  supabase: Supabase,
  coachId: string,
): Promise<string[]> {
  // Get players allowed to book with this coach
  const { data: allowedPlayers } = await supabase
    .from('player_allowed_coaches')
    .select('player_id')
    .eq('coach_id', coachId)

  let familyIds: string[] = []

  if (allowedPlayers && allowedPlayers.length > 0) {
    // Get families of allowed players
    const { data: players } = await supabase
      .from('players')
      .select('family_id')
      .in('id', allowedPlayers.map(a => a.player_id))
    familyIds = [...new Set((players ?? []).map(p => p.family_id))]
  } else {
    // No restrictions = all active families
    const { data: families } = await supabase
      .from('families')
      .select('id')
      .eq('status', 'active')
    familyIds = (families ?? []).map(f => f.id)
  }

  if (familyIds.length === 0) return []

  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'parent')
    .in('family_id', familyIds)

  return (roles ?? []).map(r => r.user_id)
}

// ── Helpers ────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
