/**
 * Parse a YYYY-MM-DD date string as local time (not UTC).
 *
 * `new Date('2025-03-03')` is parsed as UTC midnight, which shifts back
 * one day in US timezones. Appending 'T00:00:00' forces local-time parsing.
 */
export function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Format a YYYY-MM-DD date string for display using local time.
 */
export function formatLocalDate(
  dateStr: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, options);
}
