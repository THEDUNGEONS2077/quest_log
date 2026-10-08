/**
 * lib/parser.ts: inline shorthand for task titles (PLAN §9.4).
 *
 * Layer: pure lib. Parses what you type in the quick-add bar or a title
 * editor into a clean title plus task fields:
 *
 *   buy milk !! @fri 5pm // the oat one      →  "buy milk", priority 2,
 *                                                due Friday 17:00, notes "the oat one"
 *
 *   !  !!  !!!               priority low / medium / high (as separate words)
 *   @today @tomorrow         that day at the default time (setting, 09:00)
 *   @mon … @sun              the next such day (today if still ahead); may be
 *                            followed by a time: "@mon 9am"
 *   @5pm @9:30am @17:30      that time today, or tomorrow if it has passed
 *   @in 30m / 2h / 3d / 1w   relative to now ("@in2h" works too)
 *   *daily *weekdays *weekly *monthly *yearly
 *   *mon,thu  *every 2w  *every 3d  *every 2mo   repeat rule (PLAN §9.9);
 *                            without an @date, the first occurrence uses the
 *                            default time
 *   //                       everything after it becomes notes
 *   # at the very start      create as a group (ready for children)
 *   \word                    keep a word literally (\!!! stays "!!!")
 *
 * Unrecognized @words and *words stay in the title as typed. `now` and the
 * default time are passed in, so results are deterministic and testable.
 */
import { addDays, atTimeOfDay, formatDue } from './dates';
import { PRESETS, repeatLabel } from './recurrence';
import type { Priority, RepeatRule } from './types';

export interface ParseOptions {
  now: number;
  /** Time for day-only dates, in minutes after midnight (setting; 540 = 09:00). */
  defaultTimeMinutes: number;
}

/** One recognized token, for the live chips under the input. */
export interface ParsedChip {
  kind: 'priority' | 'due' | 'repeat' | 'notes' | 'group';
  /** Display text, e.g. "!!! HIGH", "FRI 09:00", "NOTE". */
  label: string;
}

export interface ParseResult {
  /** The title with every recognized token removed. */
  title: string;
  priority?: Priority;
  dueAt?: number;
  repeat?: RepeatRule;
  notes?: string;
  /** `#` prefix: create as a group. */
  group: boolean;
  chips: ParsedChip[];
}

const PRIORITY_LABEL = ['', 'LOW', 'MED', 'HIGH'] as const;
const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};
// 5pm · 5:30pm · 9am · 17:30 · 9:05
const TIME = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
// 30m · 2h · 3d · 1w (also "30min", "2hrs", "3days", "1week")
const RELATIVE = /^(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days|w|wk|week|weeks)$/i;

/**
 * Parses a repeat token (without the `*`); `next` may complete "*every 2w"
 * written as two words. Returns the rule and how many extra words it used.
 */
function parseRepeat(word: string, next: string | undefined): { rule: RepeatRule; used: number } | null {
  const w = word.toLowerCase();
  if (w in PRESETS) return { rule: { ...PRESETS[w as keyof typeof PRESETS] }, used: 0 };
  // *mon,thu: chosen weekdays.
  const days = w.split(',').map((d) => WEEKDAYS[d]);
  if (days.length && days.every((d) => d !== undefined)) {
    return {
      rule: { freq: 'week', interval: 1, weekdays: [...new Set(days as number[])].sort((a, b) => a - b), from: 'schedule' },
      used: 0,
    };
  }
  // *every 2w / *every3d / *every 2mo
  if (w === 'every' || w.startsWith('every')) {
    const spec = w === 'every' ? next?.toLowerCase() : w.slice(5);
    const m = spec ? /^(\d+)\s*(d|day|days|w|wk|week|weeks|mo|month|months|y|yr|year|years)$/.exec(spec) : null;
    if (!m) return null;
    const unit = m[2]!;
    const freq = unit.startsWith('d') ? 'day' : unit.startsWith('w') ? 'week' : unit.startsWith('m') ? 'month' : 'year';
    return { rule: { freq, interval: Math.max(1, Number(m[1])), from: 'schedule' }, used: w === 'every' ? 1 : 0 };
  }
  return null;
}

/** Parses "5pm" / "17:30" into minutes after midnight, or null. Bare numbers need am/pm or a colon. */
export function parseTime(text: string): number | null {
  const m = TIME.exec(text.trim());
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (!meridiem && !m[2]) return null; // "@5" is ambiguous: needs "5pm" or "5:00"
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  } else if (hours > 23) return null;
  return hours * 60 + minutes;
}

/** Rounds up to the next whole minute (so "@in 2h" doesn't carry seconds). */
function ceilMinute(ts: number): number {
  return Math.ceil(ts / 60_000) * 60_000;
}

/**
 * Resolves one @-expression. `next` is the word after it, consumed when it
 * completes the expression ("@mon 9am", "@in 2h"). Returns the timestamp
 * and how many extra words were used, or null if it isn't a date.
 */
function resolveDate(expr: string, next: string | undefined, opts: ParseOptions): { at: number; used: number } | null {
  const { now, defaultTimeMinutes } = opts;
  const e = expr.toLowerCase();

  // @in 2h / @in2h
  if (e === 'in' || e.startsWith('in')) {
    const rel = e === 'in' ? next : e.slice(2);
    const m = rel ? RELATIVE.exec(rel) : null;
    if (m) {
      const n = Number(m[1]);
      const unit = m[2]!.toLowerCase()[0];
      const at =
        unit === 'm' ? now + n * 60_000 : unit === 'h' ? now + n * 3_600_000 : unit === 'd' ? addDays(now, n) : addDays(now, 7 * n);
      return { at: ceilMinute(at), used: e === 'in' ? 1 : 0 };
    }
    if (e === 'in') return null;
  }

  // A time given right after the day word ("@mon 9am"), if any.
  const followingTime = next !== undefined ? parseTime(next) : null;
  const timeFor = () => followingTime ?? defaultTimeMinutes;
  const used = followingTime !== null ? 1 : 0;

  if (e === 'today' || e === 'tod') {
    const at = atTimeOfDay(now, timeFor());
    // Day-only "today" whose default time has passed: the next whole hour instead
    // of a date that's overdue the moment it's set.
    // (Floor + 1 hour, so an exact-hour `now` doesn't resolve to itself.)
    if (at <= now && followingTime === null) return { at: (Math.floor(now / 3_600_000) + 1) * 3_600_000, used };
    return { at, used };
  }
  if (e === 'tomorrow' || e === 'tmrw' || e === 'tmr') return { at: atTimeOfDay(addDays(now, 1), timeFor()), used };

  const weekday = WEEKDAYS[e];
  if (weekday !== undefined) {
    const today = new Date(now).getDay();
    let days = (weekday - today + 7) % 7;
    // Today's weekday counts only if its time is still ahead; otherwise next week.
    if (days === 0 && atTimeOfDay(now, timeFor()) <= now) days = 7;
    return { at: atTimeOfDay(addDays(now, days), timeFor()), used };
  }

  // Time only: today, or tomorrow if that time has passed ("ambiguous → next future").
  const time = parseTime(e);
  if (time !== null) {
    const today = atTimeOfDay(now, time);
    return { at: today > now ? today : atTimeOfDay(addDays(now, 1), time), used: 0 };
  }
  return null;
}

/** Parses shorthand out of `input` (see file header). */
export function parse(input: string, opts: ParseOptions): ParseResult {
  const result: ParseResult = { title: '', group: false, chips: [] };
  let text = input;

  // `#` at the very start: create as a group.
  if (/^\s*#(?!\s*$)/.test(text)) {
    result.group = true;
    text = text.replace(/^\s*#\s*/, '');
    result.chips.push({ kind: 'group', label: 'GROUP' });
  }

  // `//` (at the start or after a space, so URLs like https://… don't trigger) starts notes.
  const notesAt = text.search(/(^|\s)\/\//);
  if (notesAt >= 0) {
    const start = text.indexOf('//', notesAt);
    const notes = text.slice(start + 2).trim();
    text = text.slice(0, start);
    result.notes = notes;
    result.chips.push({ kind: 'notes', label: 'NOTE' });
  }

  const words = text.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    // \word: keep literally, without the backslash.
    if (w.startsWith('\\') && w.length > 1) {
      kept.push(w.slice(1));
      continue;
    }
    // ! !! !!! as their own word. The last one wins.
    if (/^!{1,3}$/.test(w)) {
      result.priority = w.length as Priority;
      continue;
    }
    if (w.startsWith('*') && w.length > 1) {
      const rep = parseRepeat(w.slice(1), words[i + 1]);
      if (rep) {
        result.repeat = rep.rule;
        i += rep.used;
        continue;
      }
    }
    if (w.startsWith('@') && w.length > 1) {
      const date = resolveDate(w.slice(1), words[i + 1], opts);
      if (date) {
        result.dueAt = date.at;
        i += date.used;
        continue;
      }
    }
    kept.push(w);
  }

  if (result.priority)
    result.chips.unshift({ kind: 'priority', label: `${'!'.repeat(result.priority)} ${PRIORITY_LABEL[result.priority]}` });
  if (result.dueAt !== undefined) result.chips.push({ kind: 'due', label: formatDue(result.dueAt, opts.now) });
  if (result.repeat) result.chips.push({ kind: 'repeat', label: repeatLabel(result.repeat) });
  result.title = kept.join(' ');
  return result;
}

/** True when parsing found anything (so callers can skip work for plain titles). */
export function hasShorthand(r: ParseResult): boolean {
  return r.chips.length > 0;
}
