/**
 * __tests__/lib/parser.test.ts: inline shorthand (lib/parser.ts).
 *
 * Runs in Europe/London. "Now" is Wed 7 Oct 2026, 12:00. The default time is 09:00.
 */
import { parse, parseTime } from '@/lib/parser';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 7, 12); // Wednesday
const opts = { now: NOW, defaultTimeMinutes: 9 * 60 };
const p = (s: string) => parse(s, opts);

describe('plain titles', () => {
  it('leave text untouched (apart from extra spaces)', () => {
    expect(p('call the  bank')).toEqual({ title: 'call the bank', group: false, chips: [] });
  });
  it('keep unknown @words and emails', () => {
    expect(p('ask @bob about me@x.io').title).toBe('ask @bob about me@x.io');
  });
});

describe('priority', () => {
  it('reads ! / !! / !!! as separate words, last one wins', () => {
    expect(p('ship it !!!')).toMatchObject({ title: 'ship it', priority: 3 });
    expect(p('! a !!').priority).toBe(2);
    expect(p('wow!!').priority).toBeUndefined(); // attached to a word: not a token
  });
  it('makes a chip', () => {
    expect(p('x !!').chips).toEqual([{ kind: 'priority', label: '!! MED' }]);
  });
});

describe('dates', () => {
  it('@today / @tomorrow use the default time', () => {
    expect(p('x @tomorrow').dueAt).toBe(at(2026, 10, 8, 9));
    // 09:00 today has already passed at noon: next whole hour instead.
    expect(p('x @today').dueAt).toBe(at(2026, 10, 7, 13));
    expect(p('x @today 6pm').dueAt).toBe(at(2026, 10, 7, 18));
  });

  it('weekdays resolve to the next such day', () => {
    expect(p('x @fri').dueAt).toBe(at(2026, 10, 9, 9));
    expect(p('x @mon 9am').dueAt).toBe(at(2026, 10, 12, 9));
    expect(p('x @wed').dueAt).toBe(at(2026, 10, 14, 9)); // today is Wed and 09:00 is past
    expect(p('x @wed 5pm').dueAt).toBe(at(2026, 10, 7, 17)); // today, still ahead
    expect(p('x @Friday').dueAt).toBe(at(2026, 10, 9, 9));
  });

  it('times alone mean the next future occurrence', () => {
    expect(p('x @5pm').dueAt).toBe(at(2026, 10, 7, 17));
    expect(p('x @17:30').dueAt).toBe(at(2026, 10, 7, 17, 30));
    expect(p('x @9am').dueAt).toBe(at(2026, 10, 8, 9)); // already past today
  });

  it('relative times', () => {
    expect(p('x @in 2h').dueAt).toBe(at(2026, 10, 7, 14));
    expect(p('x @in30m').dueAt).toBe(at(2026, 10, 7, 12, 30));
    expect(p('x @in 3d').dueAt).toBe(at(2026, 10, 10, 12));
    expect(p('x @in 1w').dueAt).toBe(at(2026, 10, 14, 12));
  });

  it('strips the date words and labels the chip', () => {
    const r = p('review @fri 4pm notes');
    expect(r.title).toBe('review notes');
    expect(r.chips).toEqual([{ kind: 'due', label: 'FRI 16:00' }]);
  });

  it('leaves invalid times alone', () => {
    expect(p('x @25:00').title).toBe('x @25:00');
    expect(p('x @5').title).toBe('x @5'); // ambiguous without am/pm
    expect(p('x @in soon').title).toBe('x @in soon');
  });
});

describe('notes, groups, escapes', () => {
  it('// starts notes, but not inside a URL', () => {
    expect(p('buy milk // the oat one')).toMatchObject({ title: 'buy milk', notes: 'the oat one' });
    expect(p('read https://example.com/a').title).toBe('read https://example.com/a');
  });
  it('# at the start makes a group', () => {
    expect(p('#Groceries')).toMatchObject({ title: 'Groceries', group: true });
    expect(p('fix #42').group).toBe(false);
  });
  it('\\ keeps a word literal', () => {
    expect(p('say \\!!! loudly')).toMatchObject({ title: 'say !!! loudly' });
    expect(p('email \\@fri').title).toBe('email @fri');
  });
  it('everything at once', () => {
    const r = p('#Trip !!! @in 1w // book flights');
    expect(r).toMatchObject({ title: 'Trip', group: true, priority: 3, notes: 'book flights' });
    expect(r.chips.map((c) => c.kind)).toEqual(['priority', 'group', 'notes', 'due']);
  });
});

describe('parseTime', () => {
  it('handles 12-hour and 24-hour forms', () => {
    expect(parseTime('12am')).toBe(0);
    expect(parseTime('12pm')).toBe(12 * 60);
    expect(parseTime('9:05am')).toBe(9 * 60 + 5);
    expect(parseTime('23:59')).toBe(23 * 60 + 59);
    expect(parseTime('13pm')).toBeNull();
  });
});

describe('repeat shorthand (Phase 8)', () => {
  it('presets', () => {
    expect(p('standup *daily').repeat).toEqual({ freq: 'day', interval: 1, from: 'schedule' });
    expect(p('x *weekdays').repeat!.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(p('x *monthly').repeat!.freq).toBe('month');
  });
  it('chosen weekdays and intervals', () => {
    expect(p('gym *mon,thu').repeat).toEqual({ freq: 'week', interval: 1, weekdays: [1, 4], from: 'schedule' });
    expect(p('x *every 2w').repeat).toEqual({ freq: 'week', interval: 2, from: 'schedule' });
    expect(p('x *every3d').repeat).toEqual({ freq: 'day', interval: 3, from: 'schedule' });
    expect(p('x *every 6mo').repeat!.interval).toBe(6);
  });
  it('strips the token, makes a chip, combines with a date, and leaves unknown *words alone', () => {
    const r = p('review *weekly @fri 4pm');
    expect(r.title).toBe('review');
    expect(r.chips.map((c) => c.label)).toEqual(['FRI 16:00', 'WEEKLY']);
    expect(p('5 * 3 *bold').title).toBe('5 * 3 *bold');
  });
});

describe('literal words (editing a saved title)', () => {
  it('keeps listed words as typed and parses only new ones', () => {
    const r = parse('email @fri !!', { ...opts, literal: new Set(['email', '@fri']) });
    expect(r).toMatchObject({ title: 'email @fri', priority: 2 });
    expect(r.dueAt).toBeUndefined();
  });
});
