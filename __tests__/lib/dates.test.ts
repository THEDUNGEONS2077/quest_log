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
  duePresets,
  formatDue,
  formatRelative,
  formatTime,
  isOverdue,
  minutesOfDay,
  nudgeDue,
  startOfDay,
  withDay,
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

describe('due presets', () => {
  it('offers in 1h, tonight, tomorrow and next Monday at the default time', () => {
    const now = at(2026, 10, 7, 12); // Wed noon
    expect(duePresets(now, 9 * 60)).toEqual([
      { label: 'IN 1H', at: at(2026, 10, 7, 13) },
      { label: 'TONIGHT 20:00', at: at(2026, 10, 7, 20) },
      { label: 'TOMORROW 09:00', at: at(2026, 10, 8, 9) },
      { label: 'NEXT MON 09:00', at: at(2026, 10, 12, 9) },
    ]);
  });

  it('switches to tomorrow evening after 20:00, and skips to the following Monday on a Monday', () => {
    const lateMonday = at(2026, 10, 12, 21);
    const p = duePresets(lateMonday, 9 * 60);
    expect(p[1]).toEqual({ label: 'TOMORROW 20:00', at: at(2026, 10, 13, 20) });
    expect(p[3]!.at).toBe(at(2026, 10, 19, 9));
  });
});

describe('amending a due date', () => {
  // Runs in Europe/London: clocks go back on Sun 25 Oct 2026 (02:00 → 01:00).

  it('nudges by an hour, a day or a week', () => {
    const due = at(2026, 10, 9, 15);
    expect(nudgeDue(due, 'hour')).toBe(at(2026, 10, 9, 16));
    expect(nudgeDue(due, 'day')).toBe(at(2026, 10, 10, 15));
    expect(nudgeDue(due, 'week')).toBe(at(2026, 10, 16, 15));
  });

  it('a day or week later keeps the wall-clock time across a daylight-saving change', () => {
    expect(nudgeDue(at(2026, 10, 24, 9), 'day')).toBe(at(2026, 10, 25, 9));
    expect(nudgeDue(at(2026, 10, 20, 9), 'week')).toBe(at(2026, 10, 27, 9));
  });

  it('moves to another day keeping the time, and reads the time of day', () => {
    expect(withDay(at(2026, 10, 9, 15, 30), at(2026, 10, 12))).toBe(at(2026, 10, 12, 15, 30));
    expect(minutesOfDay(at(2026, 10, 9, 17, 30))).toBe(1050);
  });
});
