/**
 * Date-only helpers.
 *
 * All leave dates are calendar dates without a time component. They are parsed from
 * "YYYY-MM-DD" strings and stored as UTC midnight so that no timezone conversion can
 * shift a date to the previous or next day. They are always formatted back with UTC getters.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD" into a UTC-midnight Date. Returns null for malformed or impossible dates. */
export function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject roll-overs such as 2025-02-30.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date (server local time) as a UTC-midnight Date. */
export function todayDateOnly(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Count Monday-Friday days between start and end, inclusive. Weekends are excluded. */
export function countWorkingDays(start, end) {
  if (start > end) return 0;
  let count = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

export function currentYear(now = new Date()) {
  return now.getFullYear();
}
