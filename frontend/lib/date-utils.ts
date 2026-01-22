/**
 * Date utility functions to handle timezone issues consistently.
 * 
 * When parsing date strings like "2026-01-21" (YYYY-MM-DD format without time),
 * JavaScript's Date constructor interprets them as UTC midnight. When these are
 * then displayed using local time methods (toLocaleDateString, getDate, etc.),
 * users in timezones west of UTC will see the previous day.
 * 
 * These utilities parse date strings as local dates to avoid this issue.
 */

/**
 * Parse a YYYY-MM-DD date string as a local date (not UTC).
 * This avoids timezone issues when displaying dates.
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object representing local midnight on that date
 */
export function parseLocalDate(dateStr: string | number | Date): Date {
  // Handle different input types
  if (typeof dateStr === 'number') {
    // Assume it's a timestamp
    return new Date(dateStr)
  }
  if (dateStr instanceof Date) {
    return dateStr
  }
  if (typeof dateStr !== 'string') {
    throw new Error(`parseLocalDate expects string, number, or Date, got ${typeof dateStr}`)
  }
  
  // Handle date strings that might have time component
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  const [year, month, day] = datePart.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Format a YYYY-MM-DD date string for display, avoiding timezone issues.
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDateString(
  dateStr: string, 
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }
): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', options)
}
