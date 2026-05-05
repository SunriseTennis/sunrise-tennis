/**
 * Adelaide-local "is this session in the future?" helper.
 *
 * Bug pattern this exists to prevent: every billing path that uses
 * `gte('date', new Date().toISOString().split('T')[0])` includes today's
 * already-passed sessions because date-only comparison ignores start_time.
 * A 12:47pm enrolment for Tue Morning Squad would write a charge for the
 * 06:45 session that already happened.
 *
 * All client/coach/parent paths that fan out per-session charges (term enrol,
 * casual book, attendance, walk-in) MUST use these helpers — never compare
 * UTC date strings directly. Adelaide is up to 10.5h ahead of UTC, so
 * UTC-date comparison is wrong at the day boundary too.
 */

const ADELAIDE_TZ = 'Australia/Adelaide'

interface MaybeSession {
  date: string
  start_time?: string | null
}

const adelaideDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ADELAIDE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const adelaideTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: ADELAIDE_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Returns YYYY-MM-DD for now in Adelaide local time. */
export function adelaideTodayString(now: Date = new Date()): string {
  return adelaideDateFmt.format(now)
}

/** Returns HH:MM:SS for now in Adelaide local time. */
export function adelaideTimeNowString(now: Date = new Date()): string {
  return adelaideTimeFmt.format(now)
}

/**
 * True when a scheduled session has not yet started in Adelaide local time.
 * - Future date (Adelaide) → true
 * - Past date (Adelaide) → false
 * - Today (Adelaide), session.start_time > now → true
 * - Today (Adelaide), session.start_time ≤ now → false (already started/passed)
 * - Today (Adelaide), no start_time → true (treat as bookable; no time to compare)
 */
export function isSessionFuture(session: MaybeSession, now: Date = new Date()): boolean {
  const today = adelaideTodayString(now)
  if (session.date > today) return true
  if (session.date < today) return false
  if (!session.start_time) return true
  // start_time is HH:MM:SS in Adelaide local; lexicographic compare works.
  return session.start_time > adelaideTimeNowString(now)
}

/** Drop sessions that have already started in Adelaide local time. */
export function filterFutureSessions<T extends MaybeSession>(
  sessions: T[],
  now: Date = new Date(),
): T[] {
  return sessions.filter(s => isSessionFuture(s, now))
}
