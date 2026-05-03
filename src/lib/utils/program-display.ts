// Shared display helpers for program names. Programs in the DB are stored with
// a day prefix (e.g. "Wed Morning Squad", "Mon Red Ball") because the day is
// part of the canonical identity for sorting/grouping. UI surfaces strip the
// day for display and may append the type word ("Group" / "Squad") so a
// "Mon Red Ball" reads naturally as "Red Ball Group". Programs whose name
// already ends with the type word ("Wed Morning Squad") must NOT be appended
// again — historical bug shipped "Morning Squad Squad".

const DAY_PREFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/**
 * Strip the day prefix and append the program type word, unless the
 * remainder already ends in that word.
 *
 *   ("Mon Red Ball", "group") → "Red Ball Group"
 *   ("Wed Morning Squad", "squad") → "Morning Squad"   (no double-append)
 *   ("Thu Yellow Squad", "squad") → "Yellow Squad"     (no double-append)
 *   ("Sat Junior Camp", "school") → "Junior Camp"      (only group/squad get a suffix)
 */
export function stripDayPrefix(name: string, type: string): string {
  const lower = name.toLowerCase()
  for (const prefix of DAY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      const stripped = name.slice(prefix.length + 1)
      const suffixWord = type === 'group' ? 'Group' : type === 'squad' ? 'Squad' : null
      if (!suffixWord) return stripped
      // Don't double-append if the stripped name already ends in the suffix word
      if (new RegExp(`\\b${suffixWord}$`, 'i').test(stripped)) return stripped
      return `${stripped} ${suffixWord}`
    }
  }
  return name
}

/**
 * Calendar-tile variant: strip the day prefix and the trailing "Ball" word.
 * Used in compact calendar event titles where width is tight and the level
 * dot already conveys the ball color.
 *
 *   "Mon Red Ball"   → "Red"
 *   "Wed Morning Squad" → "Morning Squad"
 *   "Mon Red Ball Group" → "Red Group"  (rare; we don't normally store the type word in name)
 */
export function formatCalendarTitle(name: string): string {
  let result = name
  const lower = result.toLowerCase()

  for (const prefix of DAY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      result = result.slice(prefix.length + 1)
      break
    }
  }

  result = result.replace(/\s+Ball\b/gi, '')

  return result
}
