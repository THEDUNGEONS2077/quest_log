/**
 * __tests__/lib/recurrence.test.ts: repeat rules (lib/recurrence.ts).
 *
 * Europe/London: DST starts Sun Mar 29 2026 and ends Sun Oct 25 2026.
 */
import { firstOccurrence, nextOccurrence, PRESETS, repeatLabel } from '@/lib/recurrence';
import type { RepeatRule } from '@/lib/types';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
/** Next occurrence when completed exactly at `now` (on time). */
const next = (rule: RepeatRule, due: number, now = due) => nextOccurrence(rule, due, now, now);

describe('nextOccurrence', () => {
  it('daily, every N days', () => {
    expect(next(PRESETS.daily, at(2026, 10, 7, 9))).toBe(at(2026, 10, 8, 9));
    expect(next({ freq: 'day', interval: 3, from: 'schedule' }, at(2026, 10, 7, 9))).toBe(at(2026, 10, 10, 9));
  });

  it('keeps 09:00 at 09:00 across both DST changes', () => {
    expect(next(PRESETS.daily, at(2026, 3, 28, 9))).toBe(at(2026, 3, 29, 9));
    expect(next(PRESETS.weekly, at(2026, 10, 21, 9))).toBe(at(2026, 10, 28, 9));
  });

  it('weekdays skip the weekend', () => {
    expect(next(PRESETS.weekdays, at(2026, 10, 9, 9))).toBe(at(2026, 10, 12, 9)); // Fri → Mon
    expect(next(PRESETS.weekdays, at(2026, 10, 7, 9))).toBe(at(2026, 10, 8, 9)); // Wed → Thu
  });

  it('chosen weekdays, and every 2 weeks', () => {
    const monThu: RepeatRule = { freq: 'week', interval: 1, weekdays: [1, 4], from: 'schedule' };
    expect(next(monThu, at(2026, 10, 5, 9))).toBe(at(2026, 10, 8, 9)); // Mon → Thu
    expect(next(monThu, at(2026, 10, 8, 9))).toBe(at(2026, 10, 12, 9)); // Thu → Mon
    const biweekly: RepeatRule = { freq: 'week', interval: 2, weekdays: [1, 4], from: 'schedule' };
    expect(next(biweekly, at(2026, 10, 8, 9))).toBe(at(2026, 10, 19, 9)); // Thu → Mon of the week after next
  });

  it('monthly clamps to the month end, then returns to the original day (no drift)', () => {
    const rule: RepeatRule = { ...PRESETS.monthly, monthDay: 31 };
    const feb = next(rule, at(2026, 1, 31, 9));
    expect(feb).toBe(at(2026, 2, 28, 9));
    expect(next(rule, feb)).toBe(at(2026, 3, 31, 9));
  });

  it('yearly on Feb 29 lands on Feb 28 in non-leap years', () => {
    const rule: RepeatRule = { ...PRESETS.yearly, monthDay: 29 };
    expect(next(rule, at(2028, 2, 29, 9))).toBe(at(2029, 2, 28, 9));
  });

  it('jumps over missed occurrences to the next future one', () => {
    const due = at(2026, 10, 1, 9);
    const now = at(2026, 10, 7, 12); // six days overdue
    expect(nextOccurrence(PRESETS.daily, due, now, now)).toBe(at(2026, 10, 8, 9));
  });

  it('"after completion" counts from the completion day at the due time', () => {
    const rule: RepeatRule = { freq: 'day', interval: 3, from: 'completion' };
    const due = at(2026, 10, 1, 9);
    const done = at(2026, 10, 5, 18);
    expect(nextOccurrence(rule, due, done, done)).toBe(at(2026, 10, 8, 9));
  });
});

describe('firstOccurrence', () => {
  const now = at(2026, 10, 7, 12); // Wed noon
  it('today if the default time is still ahead, else tomorrow', () => {
    expect(firstOccurrence(PRESETS.daily, now, 18 * 60)).toBe(at(2026, 10, 7, 18));
    expect(firstOccurrence(PRESETS.daily, now, 9 * 60)).toBe(at(2026, 10, 8, 9));
  });
  it('the next listed weekday for weekly rules', () => {
    expect(firstOccurrence({ freq: 'week', interval: 1, weekdays: [1], from: 'schedule' }, now, 9 * 60)).toBe(at(2026, 10, 12, 9));
  });
});

describe('repeatLabel', () => {
  it('names presets and custom rules', () => {
    expect(repeatLabel(PRESETS.daily)).toBe('DAILY');
    expect(repeatLabel(PRESETS.weekdays)).toBe('WEEKDAYS');
    expect(repeatLabel({ freq: 'week', interval: 1, weekdays: [4, 1], from: 'schedule' })).toBe('MON,THU');
    expect(repeatLabel({ freq: 'week', interval: 2, from: 'schedule' })).toBe('EVERY 2W');
    expect(repeatLabel({ freq: 'day', interval: 3, from: 'completion' })).toBe('EVERY 3D AFTER DONE');
  });
});
