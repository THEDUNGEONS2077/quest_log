/**
 * lib/dates.ts: local-calendar date math and the terminal-style date labels.
 *
 * Layer: pure lib. No date library (PLAN §4 "explicitly avoided"). Every
 * function takes `now` explicitly instead of reading the clock, so results
 * are deterministic and testable.
 *
 * DST safety: day and month arithmetic goes through the local calendar
 * (Date#setDate / setMonth), never by adding 24 h in milliseconds, so 09:00
 * stays 09:00 across daylight-saving changes (PLAN §9.9).
 *
 * Labels are English and uppercase by design (terminal UI). Fixed arrays
 * instead of Intl keep output identical on every device and engine.
 */

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Local midnight at the start of `ts`'s day. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Same local wall-clock time, `n` calendar days later (or earlier, if n < 0). */
export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/**
 * Same local wall-clock time, `n` calendar months later, clamped to the
 * month's last day: Jan 31 + 1 month = Feb 28/29 (PLAN §9.9 month-end rule).
 */
export function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  const day = d.getDate();
  // Go to day 1 first so setMonth can't overflow into the following month.
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return d.getTime();
}

/** Number of days in a month (month is 0-based, like Date). */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Whole calendar days from `from` to `to` (local dates; times ignored).
 * Rounding absorbs the 23/25-hour days around DST changes.
 */
export function dayDiff(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / (24 * HOUR));
}

/** True when both timestamps fall on the same local calendar day. */
export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** 24-hour local time: "09:00", "17:30". */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "MAR 14", plus the year when it differs from `now`'s year: "MAR 14 2027". */
export function formatDate(ts: number, now: number): string {
  const d = new Date(ts);
  const base = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * Due chip label (PLAN §12.1):
 *   today          → "17:00"
 *   tomorrow       → "TOMORROW 09:00"
 *   yesterday      → "YESTERDAY 09:00"
 *   within 6 days  → "FRI 16:00"
 *   otherwise      → "MAR 14 09:00" (with the year if it differs)
 * The OVERDUE tag is separate and decided by the caller.
 */
export function formatDue(ts: number, now: number): string {
  const days = dayDiff(now, ts);
  const time = formatTime(ts);
  if (days === 0) return time;
  if (days === 1) return `TOMORROW ${time}`;
  if (days === -1) return `YESTERDAY ${time}`;
  if (days > 1 && days < 7) return `${DAY_NAMES[new Date(ts).getDay()]} ${time}`;
  return `${formatDate(ts, now)} ${time}`;
}

/**
 * "Last modified" label on the COMPLETED tab (PLAN §9.6):
 *   under 1 minute → "NOW", under 1 hour → "5m", same day → "2h",
 *   yesterday → "YESTERDAY", otherwise → "MAR 14".
 */
export function formatRelative(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < MINUTE) return 'NOW';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (isSameDay(ts, now)) return `${Math.floor(diff / HOUR)}h`;
  if (dayDiff(ts, now) === 1) return 'YESTERDAY';
  return formatDate(ts, now);
}

/** True when a task with this due time and done state counts as OVERDUE. */
export function isOverdue(dueAt: number | null, done: boolean, now: number): boolean {
  return dueAt !== null && !done && dueAt < now;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
