const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/**
 * Format a Date or ISO string to DD-MMM-YYYY (e.g. "01-Mar-2026")
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const day = String(d.getDate()).padStart(2, '0')
  const month = MONTHS[d.getMonth()]
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

/**
 * Format a Date or ISO string to friendly format: "Apr 29, 2026"
 * Used for parent-facing dates (session lists, booking flows).
 */
export function formatDateFriendly(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date + (typeof date === 'string' && !date.includes('T') ? 'T12:00:00' : '')) : date
  const month = MONTHS[d.getMonth()]
  const day = d.getDate()
  const year = d.getFullYear()
  return `${month} ${day}, ${year}`
}

/**
 * Format a time string (HH:MM:SS or HH:MM) to 12-hour format
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}
