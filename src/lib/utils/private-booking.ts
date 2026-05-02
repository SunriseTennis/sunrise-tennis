import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getCurrentOrNextTermEnd } from '@/lib/utils/school-terms'

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
 * Get the private lesson price in cents for a family + coach + duration.
 *
 * Resolution: family + specific coach > family + all-private > coach default.
 * Pro-rated from per-30min override or per-hour coach rate.
 */
export async function getPrivatePrice(
  supabase: Supabase,
  familyId: string,
  coachId: string,
  durationMinutes: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('get_private_price', {
    target_family_id: familyId,
    target_coach_id: coachId,
    target_duration_minutes: durationMinutes,
  })

  if (error) {
    console.error('Failed to get private price:', error.message)
    throw new Error('Price calculation failed')
  }

  return data as number
}

export interface PrivateRateResolved {
  per30Cents: number
  defaultPerHourCents: number
  isOverride: boolean
  validUntil: string | null
  overrideSource: 'family_coach' | 'family_all_private' | null
}

/**
 * Resolve a family's effective private rate for a coach in a single round trip.
 * Returns the per-30 price + the default per-hour rate (for "$X (was $Y)" display)
 * + override metadata (valid_until + source).
 */
export async function getPrivateRateForFamily(
  supabase: Supabase,
  familyId: string,
  coachId: string,
): Promise<PrivateRateResolved | null> {
  const { data, error } = await supabase.rpc('get_private_rate_for_family', {
    target_family_id: familyId,
    target_coach_id: coachId,
  })

  if (error) {
    console.error('Failed to resolve private rate:', error.message)
    return null
  }
  // Postgres function returns a setof; the JS client gives us an array.
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    per30Cents: row.per_30_cents,
    defaultPerHourCents: row.default_per_hour_cents,
    isOverride: !!row.is_override,
    validUntil: row.valid_until ?? null,
    overrideSource: (row.override_source as PrivateRateResolved['overrideSource']) ?? null,
  }
}

/**
 * Calculate coach pay from a lesson price.
 * Formula: 50% of ex-GST amount. GST = 10%.
 */
export function calculateCoachPay(priceCents: number): number {
  return Math.round((priceCents / 1.1) * 0.5)
}

// ── Availability ───────────────────────────────────────────────────────

export interface TimeSlot {
  date: string      // YYYY-MM-DD
  startTime: string  // HH:MM
  endTime: string    // HH:MM
}

export interface AvailabilityWindow {
  day_of_week: number
  start_time: string
  end_time: string
}

export interface AvailabilityException {
  exception_date: string
  start_time: string | null
  end_time: string | null
}

export interface BookedSession {
  date: string
  start_time: string | null
  end_time: string | null
}

/**
 * Pure function: compute available 30-minute slots from pre-fetched data.
 * Can run on both server and client (no Supabase dependency).
 */
export function computeAvailableSlots(
  windows: AvailabilityWindow[],
  exceptions: AvailabilityException[],
  bookedSessions: BookedSession[],
  startDate: string,
  endDate: string,
): TimeSlot[] {
  if (!windows.length) return []

  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  const slots: TimeSlot[] = []

  for (const dateStr of dates) {
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay()

    const dayWindows = windows.filter(w => w.day_of_week === dayOfWeek)
    if (!dayWindows.length) continue

    const dayExceptions = exceptions.filter(e => e.exception_date === dateStr)
    const fullDayBlocked = dayExceptions.some(e => !e.start_time && !e.end_time)
    if (fullDayBlocked) continue

    for (const window of dayWindows) {
      const windowStart = timeToMinutes(window.start_time)
      const windowEnd = timeToMinutes(window.end_time)

      for (let slotStart = windowStart; slotStart + 30 <= windowEnd; slotStart += 30) {
        const slotEnd = slotStart + 30
        const startTime = minutesToTime(slotStart)
        const endTime = minutesToTime(slotEnd)

        const blocked = dayExceptions.some(e => {
          if (!e.start_time || !e.end_time) return false
          const excStart = timeToMinutes(e.start_time)
          const excEnd = timeToMinutes(e.end_time)
          return slotStart < excEnd && slotEnd > excStart
        })
        if (blocked) continue

        const booked = bookedSessions.some(s => {
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

/**
 * Get available 30-minute slots for a coach within a date range.
 * Fetches data from Supabase then delegates to computeAvailableSlots.
 */
export async function getAvailableSlots(
  supabase: Supabase,
  coachId: string,
  startDate: string,
  endDate: string,
): Promise<TimeSlot[]> {
  const [
    { data: windows },
    { data: exceptions },
    { data: bookedSessions },
  ] = await Promise.all([
    supabase
      .from('coach_availability')
      .select('day_of_week, start_time, end_time')
      .eq('coach_id', coachId)
      .lte('effective_from', endDate)
      .or(`effective_until.is.null,effective_until.gte.${startDate}`),
    supabase
      .from('coach_availability_exceptions')
      .select('exception_date, start_time, end_time')
      .eq('coach_id', coachId)
      .gte('exception_date', startDate)
      .lte('exception_date', endDate),
    supabase
      .from('sessions')
      .select('date, start_time, end_time')
      .eq('coach_id', coachId)
      .neq('status', 'cancelled')
      .gte('date', startDate)
      .lte('date', endDate),
  ])

  return computeAvailableSlots(
    windows ?? [],
    exceptions ?? [],
    bookedSessions ?? [],
    startDate,
    endDate,
  )
}

// ── Booking Constraints ────────────────────────────────────────────────

/**
 * Validate booking timing constraints.
 * - 24hr minimum notice (except for Maxim's sessions)
 * - Must be within current term + holidays (or current holidays + next term)
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

  // Maximum advance: end of term + holidays
  const rangeEnd = getCurrentOrNextTermEnd(now)
  if (rangeEnd && sessionDateTime > new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000)) {
    return { valid: false, error: 'Bookings can only be made within the current term and holidays' }
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
 * Fortnightly: '2026-F07' (fortnight number, 1-based)
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

  // ISO week number (shared by weekly and fortnightly)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)

  if (payPeriod === 'fortnightly') {
    const fnNo = Math.ceil(weekNo / 2)
    return `${d.getUTCFullYear()}-F${String(fnNo).padStart(2, '0')}`
  }

  // Weekly
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
