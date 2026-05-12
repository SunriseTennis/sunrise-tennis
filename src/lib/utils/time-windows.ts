/**
 * Plan 25 — Adelaide-local quiet hours helpers for notification deferral.
 *
 * Quiet hours: 21:00 ≤ Adelaide-local time < 09:00. Push/email notifications
 * routed via dispatchNotification to a parent/coach audience are queued in
 * `notification_outbox` when fired inside this window, and flushed by the
 * daily cron at /api/cron/dispatch-queued-notifications.
 *
 * Window-end is 09:00 (not 08:00) so it matches the cron's wall-clock fire
 * time year-round. Vercel Hobby caps crons at daily, so the cron expression
 * `30 23 * * *` UTC fires at 09:00 ACST (winter) or 10:00 ACDT (summer).
 * Always ≥ 09:00 Adelaide, so the cron is never earlier than the queue's
 * deliver_after stamp — no notification can wait an extra day.
 *
 * Adelaide is UTC+9:30 (ACST) or UTC+10:30 (ACDT) depending on DST. We
 * resolve the wall-clock instant by formatting through Intl with timeZone
 * 'Australia/Adelaide' rather than rolling our own offset math.
 */

const ADELAIDE_TZ = 'Australia/Adelaide'

/** End of quiet hours (inclusive). 09:00 = start of normal delivery window. */
export const QUIET_HOURS_END_HOUR = 9
/** Start of quiet hours (inclusive). 21:00 = first hour push/email is deferred. */
export const QUIET_HOURS_START_HOUR = 21

const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: ADELAIDE_TZ,
  hour: '2-digit',
  hour12: false,
})

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ADELAIDE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function adelaideHour(at: Date): number {
  return Number(hourFmt.format(at))
}

interface AdelaideParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function adelaideParts(at: Date): AdelaideParts {
  const parts = partsFmt.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPart['type']): number => {
    const p = parts.find(x => x.type === type)
    return p ? Number(p.value) : 0
  }
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // 'en-CA' renders 24-hour as '24' for midnight; normalise to 0.
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * Convert an Adelaide wall-clock target (year/month/day/hour, minute=0, second=0)
 * to the corresponding UTC Date.
 *
 * Adelaide's UTC offset is +9:30 or +10:30; we don't hardcode either. Instead we
 * pick a candidate UTC instant, format it through Intl, and read back the offset
 * needed to make the wall-clock match. One iteration is enough for any hour
 * outside the DST transition window (we never target 02:00–03:00 in this codebase,
 * so the rare DST-fold ambiguity doesn't bite — and even if it did, the cron is
 * tolerant of being a tick early or late).
 */
function adelaideWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
): Date {
  // First guess: treat the target as if it were UTC, then subtract the offset
  // Adelaide currently has at that approximate instant.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0))
  const guessParts = adelaideParts(guess)
  // Difference (in minutes) between Adelaide wall-clock at `guess` and our target.
  const targetMin = day * 1440 + hour * 60
  const guessMin =
    guessParts.day * 1440 + guessParts.hour * 60 + guessParts.minute
  // Adjust the guess by the gap. Day rollovers are handled because we encode day
  // into the comparison.
  const deltaMin = targetMin - guessMin
  return new Date(guess.getTime() + deltaMin * 60_000)
}

/**
 * True when the current Adelaide-local time is inside quiet hours.
 *
 * Quiet hours: hour ≥ 21 OR hour < 8 (Adelaide).
 */
export function isQuietHoursActive(now: Date = new Date()): boolean {
  const hour = adelaideHour(now)
  return hour >= QUIET_HOURS_START_HOUR || hour < QUIET_HOURS_END_HOUR
}

/**
 * Returns the UTC Date corresponding to the next 08:00 Adelaide ≥ `now`.
 *
 * - If `now` is before 08:00 Adelaide (i.e. late night carry-over): today's 08:00 Adelaide.
 * - Otherwise (08:00–23:59 Adelaide): tomorrow's 08:00 Adelaide.
 *
 * Used by the dispatcher to stamp `notification_outbox.deliver_after` when
 * a notification is deferred.
 */
export function nextAdelaideQuietWindowEnd(now: Date = new Date()): Date {
  const parts = adelaideParts(now)
  // If Adelaide-local hour is < 08, today's 08:00 is the next window-end.
  // Else, we roll to tomorrow.
  let { year, month, day } = parts
  if (parts.hour >= QUIET_HOURS_END_HOUR) {
    // Roll forward one Adelaide-local day. Build a Date at noon Adelaide
    // tomorrow and read the parts back so month/year boundary handling is
    // correct without us reimplementing Gregorian rules.
    const tomorrowGuess = adelaideWallClockToUtc(year, month, day + 1, 12)
    const tomorrowParts = adelaideParts(tomorrowGuess)
    year = tomorrowParts.year
    month = tomorrowParts.month
    day = tomorrowParts.day
  }
  return adelaideWallClockToUtc(year, month, day, QUIET_HOURS_END_HOUR)
}
