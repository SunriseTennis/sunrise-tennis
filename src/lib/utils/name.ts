/**
 * Plan 17 follow-up — split a stored full "First Last" string into
 * first + last for editing in two separate inputs. Naive: split on the
 * first space; everything before is first name, everything after is
 * last name. If there's no space, the whole string becomes first name.
 *
 * This only matters for back-compat — pre-Plan-17 records stored just
 * `primary_contact.name`. New records carry first + last separately at
 * input time and we recombine on save.
 */
export function splitFullName(full: string | null | undefined): { first: string; last: string } {
  const s = (full ?? '').trim()
  if (!s) return { first: '', last: '' }
  const i = s.indexOf(' ')
  if (i < 0) return { first: s, last: '' }
  return { first: s.slice(0, i).trim(), last: s.slice(i + 1).trim() }
}

/** Combine first + last into a single display string. Trims internal whitespace. */
export function joinFullName(first: string, last: string): string {
  return `${(first ?? '').trim()} ${(last ?? '').trim()}`.trim()
}
