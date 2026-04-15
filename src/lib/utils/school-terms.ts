/**
 * SA school term dates — hardcoded from education.sa.gov.au
 * Update annually when new dates are published.
 */

export interface SchoolTerm {
  term: number
  year: number
  start: Date
  end: Date
}

// Source: https://www.education.sa.gov.au/students/term-dates-south-australian-state-schools
const SA_TERMS: SchoolTerm[] = [
  // 2025
  { term: 1, year: 2025, start: new Date(2025, 0, 28), end: new Date(2025, 3, 11) },
  { term: 2, year: 2025, start: new Date(2025, 3, 28), end: new Date(2025, 6, 4) },
  { term: 3, year: 2025, start: new Date(2025, 6, 21), end: new Date(2025, 8, 26) },
  { term: 4, year: 2025, start: new Date(2025, 9, 13), end: new Date(2025, 11, 12) },
  // 2026
  { term: 1, year: 2026, start: new Date(2026, 0, 27), end: new Date(2026, 3, 10) },
  { term: 2, year: 2026, start: new Date(2026, 3, 27), end: new Date(2026, 6, 3) },
  { term: 3, year: 2026, start: new Date(2026, 6, 20), end: new Date(2026, 8, 25) },
  { term: 4, year: 2026, start: new Date(2026, 9, 12), end: new Date(2026, 11, 11) },
]

/**
 * SA public holidays — hardcoded from safework.sa.gov.au
 * Used to skip holidays when generating sessions.
 * Note: SA has Proclamation Day (26 Dec) instead of King's Birthday.
 */
const SA_PUBLIC_HOLIDAYS: Date[] = [
  // 2025
  new Date(2025, 0, 1),   // New Year's Day
  new Date(2025, 0, 27),  // Australia Day (Mon)
  new Date(2025, 2, 10),  // Adelaide Cup
  new Date(2025, 3, 18),  // Good Friday
  new Date(2025, 3, 19),  // Easter Saturday
  new Date(2025, 3, 21),  // Easter Monday
  new Date(2025, 3, 25),  // ANZAC Day
  new Date(2025, 9, 6),   // Labour Day (SA)
  new Date(2025, 11, 25), // Christmas Day
  new Date(2025, 11, 26), // Proclamation Day
  // 2026
  new Date(2026, 0, 1),   // New Year's Day
  new Date(2026, 0, 26),  // Australia Day
  new Date(2026, 2, 9),   // Adelaide Cup
  new Date(2026, 3, 3),   // Good Friday
  new Date(2026, 3, 4),   // Easter Saturday
  new Date(2026, 3, 6),   // Easter Monday
  new Date(2026, 3, 25),  // ANZAC Day (Saturday)
  new Date(2026, 9, 5),   // Labour Day (SA)
  new Date(2026, 11, 25), // Christmas Day
  new Date(2026, 11, 28), // Proclamation Day (Mon, since 26 Dec is Saturday)
]

/** Find a specific term by number and year */
export function getTerm(term: number, year: number): SchoolTerm | undefined {
  return SA_TERMS.find(t => t.term === term && t.year === year)
}

/** Parse term from URL search params — safe for server components */
export function getTermFromParams(
  searchParams: { term?: string; year?: string },
): { termNum: number; year: number; start: string; end: string } | null {
  const { term, year } = searchParams
  if (!term || !year) return null
  const found = SA_TERMS.find(t => t.term === Number(term) && t.year === Number(year))
  if (!found) return null
  return {
    termNum: found.term,
    year: found.year,
    start: found.start.toISOString().split('T')[0],
    end: found.end.toISOString().split('T')[0],
  }
}

/** Returns all configured terms sorted by year + term number */
export function getAllTerms(): SchoolTerm[] {
  return [...SA_TERMS].sort((a, b) => a.year - b.year || a.term - b.term)
}

/**
 * Human-readable term label for a given date: "Term 2 2026".
 * Returns null if the date falls outside any configured term (holidays).
 */
export function getTermLabel(date: Date | string): string | null {
  const d = typeof date === 'string' ? new Date(date) : date
  const t = getTermForDate(d)
  return t ? `Term ${t.term} ${t.year}` : null
}

/** Find the term that contains a given date, or null */
export function getTermForDate(date: Date): SchoolTerm | null {
  const day = startOfDay(date)
  for (const t of SA_TERMS) {
    if (day >= startOfDay(t.start) && day <= startOfDay(t.end)) return t
  }
  return null
}

/**
 * Get the current or next upcoming term.
 * If we're in the last week of a term, returns the NEXT term instead
 * (programs are wrapping up, admin wants to see next term by default).
 */
export function getCurrentOrNextTerm(from: Date): SchoolTerm | null {
  const day = startOfDay(from)
  // Inside a term?
  for (let i = 0; i < SA_TERMS.length; i++) {
    const t = SA_TERMS[i]
    if (day >= startOfDay(t.start) && day <= startOfDay(t.end)) {
      // If less than 7 days until term ends and a next term exists, return next term
      const daysLeft = daysBetween(day, startOfDay(t.end))
      if (daysLeft <= 7 && SA_TERMS[i + 1]) return SA_TERMS[i + 1]
      return t
    }
  }
  // Between terms — next upcoming
  for (const t of SA_TERMS) {
    if (startOfDay(t.start) > day) return t
  }
  return null
}

/** Check if a given date is a SA public holiday */
export function isPublicHoliday(date: Date): boolean {
  const d = startOfDay(date)
  return SA_PUBLIC_HOLIDAYS.some(h => startOfDay(h).getTime() === d.getTime())
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Returns term info for the week containing `monday`.
 * - During a term: "T1, Wk 8"
 * - During holidays: "Term 1 Holidays"
 * - Summer holidays: "Summer Holidays"
 * - Unknown: null
 */
export function getTermInfo(monday: Date): string | null {
  const day = startOfDay(monday)

  // Check if we're inside a term
  for (const t of SA_TERMS) {
    if (day >= startOfDay(t.start) && day <= startOfDay(t.end)) {
      const week = Math.floor(daysBetween(startOfDay(t.start), day) / 7) + 1
      return `T${t.term}, Wk ${week}`
    }
  }

  // Check if we're in holidays between terms
  const yearTerms = SA_TERMS.filter(t => t.year === day.getFullYear())
  for (let i = 0; i < yearTerms.length - 1; i++) {
    const afterTerm = startOfDay(yearTerms[i].end)
    const beforeTerm = startOfDay(yearTerms[i + 1].start)
    if (day > afterTerm && day < beforeTerm) {
      return `Term ${yearTerms[i].term} Holidays`
    }
  }

  // Check summer holidays (after T4 of previous year, before T1 of current year)
  const currentYearT1 = SA_TERMS.find(t => t.year === day.getFullYear() && t.term === 1)
  const prevYearT4 = SA_TERMS.find(t => t.year === day.getFullYear() - 1 && t.term === 4)
  if (currentYearT1 && day < startOfDay(currentYearT1.start)) {
    if (!prevYearT4 || day > startOfDay(prevYearT4.end)) {
      return 'Summer Holidays'
    }
  }

  // After T4 of current year
  const currentYearT4 = SA_TERMS.find(t => t.year === day.getFullYear() && t.term === 4)
  if (currentYearT4 && day > startOfDay(currentYearT4.end)) {
    return 'Summer Holidays'
  }

  return null
}

/**
 * Returns the start date of the next upcoming term (after `from`).
 * Returns null if no future terms are configured.
 */
export function getNextTermStart(from: Date): Date | null {
  const day = startOfDay(from)
  for (const t of SA_TERMS) {
    const tStart = startOfDay(t.start)
    if (tStart > day) return tStart
  }
  return null
}

/**
 * Returns the start and end date strings (YYYY-MM-DD) of the current or next term.
 * If between terms, returns the next upcoming term range.
 * Falls back to current year bounds if no term matches.
 */
export function getCurrentTermRange(from: Date): { start: string; end: string } {
  const day = startOfDay(from)

  // Check if we're inside a term
  for (const t of SA_TERMS) {
    if (day >= startOfDay(t.start) && day <= startOfDay(t.end)) {
      return {
        start: t.start.toISOString().split('T')[0],
        end: t.end.toISOString().split('T')[0],
      }
    }
  }

  // Between terms — use next upcoming term
  for (const t of SA_TERMS) {
    if (startOfDay(t.start) > day) {
      return {
        start: t.start.toISOString().split('T')[0],
        end: t.end.toISOString().split('T')[0],
      }
    }
  }

  // Fallback to current year
  const year = from.getFullYear()
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  }
}

/**
 * Returns the end date of the next upcoming term (includes current if inside one).
 * Always shows through the next full term so parents can book ahead.
 */
/**
 * Returns the booking range end date:
 * - During Term X: end of Term X holidays (= day before Term X+1 starts)
 * - During Term X holidays: end of Term X+1
 * Always returns at least 12 weeks out as a fallback.
 */
export function getCurrentOrNextTermEnd(from: Date): Date | null {
  const day = startOfDay(from)
  const fallback = new Date(day.getTime() + 84 * 24 * 60 * 60 * 1000) // 12 weeks

  // Check if we're inside a term
  const currentTerm = getTermForDate(from)
  if (currentTerm) {
    const idx = SA_TERMS.indexOf(currentTerm)
    const nextTerm = SA_TERMS[idx + 1]
    // During a term: book through the holidays until next term starts
    if (nextTerm) {
      const holidayEnd = new Date(nextTerm.start.getTime() - 24 * 60 * 60 * 1000)
      return holidayEnd > fallback ? holidayEnd : fallback
    }
    return fallback
  }

  // We're in holidays — find the next term
  for (const t of SA_TERMS) {
    if (startOfDay(t.start) > day) {
      // During holidays: book through the end of the next term
      return t.end > fallback ? t.end : fallback
    }
  }
  return fallback
}
