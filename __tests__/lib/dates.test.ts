/**
 * __tests__/lib/dates.test.ts: calendar math and labels (lib/dates.ts).
 *
 * Runs in Europe/London (jest.global-setup.js). 2026 DST changes: clocks go
 * forward on Sun Mar 29 and back on Sun Oct 25.
 */
import {
  addDays,
  addMonths,
  dayDiff,
  daysInMonth,
  formatDue,
  formatRelative,
  formatTime,
  isOverdue,
  startOfDay,
} from '@/lib/dates';

/** Local time → epoch ms (month is 1-based here, for readability). */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('environment', () => {
  it('runs in the pinned time zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/London');
  });
});

describe('calendar math', () => {
  it('keeps 09:00 at 09:00 across the spring DST change', () => {
    const before = at(2026, 3, 28, 9);
    const after = addDays(before, 1); // Mar 29 is a 23-hour day
    expect(formatTime(after)).toBe('09:00');
    expect(after - before).toBe(23 * 3600_000);
  });

  it('keeps 09:00 at 09:00 across the autumn DST change', () => {
    expect(formatTime(addDays(at(2026, 10, 24, 9), 1))).toBe('09:00');
  });

  it('counts calendar days, ignoring the time of day and DST', () => {
    expect(dayDiff(at(2026, 3, 28, 23), at(2026, 3, 30, 1))).toBe(2);
    expect(dayDiff(at(2026, 10, 7, 12), at(2026, 10, 7, 23))).toBe(0);
    expect(dayDiff(at(2026, 10, 8), at(2026, 10, 7))).toBe(-1);
  });

  it('clamps month-end dates (PLAN §9.9)', () => {
    expect(new Date(addMonths(at(2026, 1, 31, 9), 1)).getDate()).toBe(28);
    expect(new Date(addMonths(at(2028, 1, 31, 9), 1)).getDate()).toBe(29); // leap year
    expect(new Date(addMonths(at(2026, 3, 31, 9), 1)).getDate()).toBe(30);
    expect(new Date(addMonths(at(2026, 12, 15, 9), 1)).getFullYear()).toBe(2027);
    expect(daysInMonth(2026, 1)).toBe(28); // Feb (0-based month)
  });

  it('finds local midnight', () => {
    expect(startOfDay(at(2026, 10, 7, 15, 30))).toBe(at(2026, 10, 7));
  });
});

describe('labels', () => {
  const now = at(2026, 10, 7, 12); // Wed Oct 7 2026, 12:00

  it('formats due chips relative to today', () => {
    expect(formatDue(at(2026, 10, 7, 17), now)).toBe('17:00');
    expect(formatDue(at(2026, 10, 8, 9), now)).toBe('TOMORROW 09:00');
    expect(formatDue(at(2026, 10, 6, 9), now)).toBe('YESTERDAY 09:00');
    expect(formatDue(at(2026, 10, 9, 16), now)).toBe('FRI 16:00');
    expect(formatDue(at(2026, 10, 20, 9, 5), now)).toBe('OCT 20 09:05');
    expect(formatDue(at(2027, 3, 14, 9), now)).toBe('MAR 14 2027 09:00');
  });

  it('formats COMPLETED-tab relative times', () => {
    expect(formatRelative(now - 30_000, now)).toBe('NOW');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5m');
    expect(formatRelative(at(2026, 10, 7, 9, 30), now)).toBe('2h');
    expect(formatRelative(at(2026, 10, 6, 23), now)).toBe('YESTERDAY');
    expect(formatRelative(at(2026, 3, 14, 9), now)).toBe('MAR 14');
    expect(formatRelative(at(2025, 3, 14, 9), now)).toBe('MAR 14 2025');
  });

  it('decides OVERDUE', () => {
    expect(isOverdue(now - 1, false, now)).toBe(true);
    expect(isOverdue(now - 1, true, now)).toBe(false);
    expect(isOverdue(null, false, now)).toBe(false);
    expect(isOverdue(now + 1, false, now)).toBe(false);
  });
});
