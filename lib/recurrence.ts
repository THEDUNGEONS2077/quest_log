/**
 * lib/recurrence.ts: repeat rules and their next occurrence (PLAN §9.9).
 *
 * Layer: pure lib. All arithmetic goes through the local calendar
 * (lib/dates.ts), so 09:00 stays 09:00 across daylight-saving changes.
 *
 * Rules:
 *   - from 'schedule': the next date counts from the due date; from
 *     'completion': from when it was completed (keeping the due time of day).
 *   - Missed occurrences: completing an overdue task jumps to the next
 *     *future* occurrence; no backlog is created.
 *   - Monthly/yearly on a day a month lacks (the 31st, Feb 29) clamps to the
 *     month's last day, then returns to the original day when it exists
 *     again. The original day is kept in `rule.monthDay`, so there's no drift
 *     (Jan 31 → Feb 28 → Mar 31, not Mar 28).
 */
import { addDays, atTimeOfDay, daysInMonth, startOfDay } from './dates';
import type { RepeatRule } from './types';

/** Common presets for the repeat sheet and shorthand. */
export const PRESETS = {
  daily: { freq: 'day', interval: 1, from: 'schedule' },
  weekdays: { freq: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5], from: 'schedule' },
  weekly: { freq: 'week', interval: 1, from: 'schedule' },
  monthly: { freq: 'month', interval: 1, from: 'schedule' },
  yearly: { freq: 'year', interval: 1, from: 'schedule' },
} as const satisfies Record<string, RepeatRule>;

/** Minutes after midnight of a timestamp (its local time of day). */
function timeOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/** `ts` moved to `day` of the month that's `months` later, clamped, same time of day. */
function addMonthsAnchored(ts: number, months: number, day: number): number {
  const d = new Date(ts);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const clamped = Math.min(day, daysInMonth(target.getFullYear(), target.getMonth()));
  return atTimeOfDay(new Date(target.getFullYear(), target.getMonth(), clamped).getTime(), timeOfDay(ts));
}

/** One step of the rule after `ts` (strictly later). `anchorDay` is the month day to return to. */
function step(rule: RepeatRule, ts: number, anchorDay: number): number {
  const n = Math.max(1, Math.floor(rule.interval));
  switch (rule.freq) {
    case 'day':
      return addDays(ts, n);
    case 'week': {
      const days = rule.weekdays?.length ? [...rule.weekdays].sort((a, b) => a - b) : null;
      if (!days) return addDays(ts, 7 * n);
      // Next listed weekday later this week; past the last one, the first
      // listed weekday of the week `n` weeks on (weeks start on Sunday).
      const wd = new Date(ts).getDay();
      const later = days.find((d) => d > wd);
      if (later !== undefined) return addDays(ts, later - wd);
      return addDays(ts, 7 * n - wd + days[0]!);
    }
    case 'month':
      return addMonthsAnchored(ts, n, anchorDay);
    case 'year':
      return addMonthsAnchored(ts, 12 * n, anchorDay);
  }
}

/**
 * The next occurrence after a completion.
 *   dueAt       the task's current due date (repeats require one)
 *   completedAt when it was checked off
 *   now         the current time (usually = completedAt)
 * The result is always in the future (after `now`).
 */
export function nextOccurrence(rule: RepeatRule, dueAt: number, completedAt: number, now: number): number {
  const anchorDay = rule.monthDay ?? new Date(dueAt).getDate();
  // The usual time of day: kept on the rule after a snooze, else the due time.
  const time = rule.timeOfDay ?? timeOfDay(dueAt);
  const snap = (ts: number) => atTimeOfDay(ts, time);
  // Where to count from: the schedule, or the completion day.
  let next = snap(step(rule, rule.from === 'completion' ? completedAt : dueAt, anchorDay));
  // Skip missed occurrences (bounded: even a daily rule 50 years overdue is ~18k steps).
  for (let guard = 0; next <= now && guard < 100_000; guard++) next = snap(step(rule, next, anchorDay));
  return next;
}

/** The rule with its usual time of day pinned (before a snooze moves the due time). */
export function pinTimeOfDay(rule: RepeatRule, dueAt: number): RepeatRule {
  return rule.timeOfDay !== undefined ? rule : { ...rule, timeOfDay: timeOfDay(dueAt) };
}

/**
 * A first due date for a task that's given a repeat rule without one:
 * the next matching day at the default time (PLAN §9.9). For weekly rules
 * with weekdays, the next listed weekday; otherwise today if the default
 * time is still ahead, else tomorrow.
 */
export function firstOccurrence(rule: RepeatRule, now: number, defaultTimeMinutes: number): number {
  const today = atTimeOfDay(now, defaultTimeMinutes);
  if (rule.freq === 'week' && rule.weekdays?.length) {
    for (let i = 0; i < 8; i++) {
      const candidate = atTimeOfDay(addDays(startOfDay(now), i), defaultTimeMinutes);
      if (rule.weekdays.includes(new Date(candidate).getDay()) && candidate > now) return candidate;
    }
  }
  return today > now ? today : atTimeOfDay(addDays(now, 1), defaultTimeMinutes);
}

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** Short label for chips and the sheet: DAILY, WEEKDAYS, MON,THU, EVERY 2W, MONTHLY… */
export function repeatLabel(rule: RepeatRule): string {
  const n = rule.interval;
  const suffix = rule.from === 'completion' ? ' AFTER DONE' : '';
  if (rule.freq === 'week' && rule.weekdays?.length) {
    const days = [...rule.weekdays].sort((a, b) => a - b);
    const base = days.join() === '1,2,3,4,5' ? 'WEEKDAYS' : days.map((d) => DAY_SHORT[d]).join(',');
    return (n > 1 ? `${base} /${n}W` : base) + suffix;
  }
  const unit = { day: ['DAILY', 'D'], week: ['WEEKLY', 'W'], month: ['MONTHLY', 'MO'], year: ['YEARLY', 'Y'] }[rule.freq];
  return (n === 1 ? unit[0] : `EVERY ${n}${unit[1]}`) + suffix;
}
