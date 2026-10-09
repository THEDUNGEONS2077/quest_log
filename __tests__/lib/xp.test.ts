/**
 * __tests__/lib/xp.test.ts: XP, levels and streaks (lib/xp.ts) as they
 * apply through completion (lib/complete.ts check / uncheck).
 *
 * Runs in Europe/London. "Now" is Fri 9 Oct 2026, 12:00.
 */
import { replaceOp } from '@/lib/backup';
import { check, uncheck } from '@/lib/complete';
import { duplicate } from '@/lib/copy';
import { apply } from '@/lib/ops';
import { toDocument } from '@/lib/tree';
import type { TasksState } from '@/lib/types';
import { currentDayStreak, levelInfo, previewXp, progressAfterCompletion, xpToNext } from '@/lib/xp';

import { build, tk } from '../helpers/tree';

const at = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h).getTime();
const NOW = at(2026, 10, 9, 12);
const DAY = 86_400_000;
const done = (s: TasksState, id: string, when = NOW) => apply(s, check(s, id, when).op).state;

describe('levels', () => {
  it('start at 0; each level needs 25 XP more than the one before', () => {
    expect([0, 1, 2, 3].map(xpToNext)).toEqual([50, 75, 100, 125]);
    expect(levelInfo(0)).toEqual({ level: 0, into: 0, needed: 50, fraction: 0 });
    expect(levelInfo(49).level).toBe(0);
    expect(levelInfo(50)).toMatchObject({ level: 1, into: 0, needed: 75 });
    expect(levelInfo(125)).toMatchObject({ level: 2, into: 0 });
    expect(levelInfo(150)).toMatchObject({ level: 2, into: 25, fraction: 0.25 });
  });
});

describe('XP for completing tasks', () => {
  it('a plain task earns 10; priority adds 2 / 5 / 10', () => {
    expect(done(build([['a']]), 'a').progress.xp).toBe(10);
    expect(done(build([['a', { priority: 3 }]]), 'a').progress.xp).toBe(20);
    expect(tk(done(build([['a', { priority: 1 }]]), 'a'), 'a')!.xp).toBe(12);
  });

  it('a quest earns +8 per subtask when it completes (more subtasks, more XP)', () => {
    let s = build([['quest', [['a'], ['b'], ['c']]]]);
    expect(previewXp(s, 'quest', NOW)).toBe(10 + 3 * 8);
    s = done(s, 'a');
    s = done(s, 'b');
    expect(s.progress.xp).toBe(20);
    s = done(s, 'c'); // the last one: the quest auto-completes too
    expect(tk(s, 'quest')!.xp).toBe(34);
    expect(s.progress.xp).toBe(30 + 34);
  });

  it('on time: +5 when the due date has not passed', () => {
    expect(done(build([['a', { dueAt: NOW + 3600_000 }]]), 'a').progress.xp).toBe(15);
    expect(done(build([['a', { dueAt: NOW - 3600_000 }]]), 'a').progress.xp).toBe(10);
  });

  it('UNDO takes the XP back exactly, and unchecking returns what the task earned', () => {
    const s0 = build([['a', { priority: 2 }]]);
    const { state, inverse } = apply(s0, check(s0, 'a', NOW).op);
    expect(state.progress.xp).toBe(15);
    expect(apply(state, inverse).state.progress).toEqual(s0.progress);
    const unchecked = apply(state, uncheck(state, 'a', NOW)).state;
    expect(unchecked.progress.xp).toBe(0);
    expect(tk(unchecked, 'a')!.xp).toBe(0);
  });

  it('XP stays when completed tasks are removed for good, and duplicates carry none', () => {
    const s = done(build([['a']]), 'a');
    expect(apply(s, { type: 'remove', id: 'a' }).state.progress.xp).toBe(10);
    const copy = duplicate(s, 'a', NOW, () => 'copy');
    expect(tk(apply(s, copy.op).state, 'copy')!.xp).toBe(0);
  });
});

describe('streaks', () => {
  it('day streak: +5% per day in a row after the first; a missed day restarts it', () => {
    let s = done(build([['a'], ['b'], ['c'], ['d']]), 'a', NOW - 2 * DAY);
    expect(s.progress.dayStreak).toBe(1);
    s = done(s, 'b', NOW - DAY);
    expect(s.progress).toMatchObject({ dayStreak: 2, bestDayStreak: 2 });
    const before = s.progress.xp;
    s = done(s, 'c', NOW);
    expect(s.progress.dayStreak).toBe(3);
    expect(s.progress.xp - before).toBe(Math.round(10 * 1.1)); // day 3: ×1.10
    // Same day: counts once.
    expect(progressAfterCompletion(s.progress, NOW + 3600_000)).toBe(s.progress);
    // Shown as 0 once a whole day is missed; the next completion starts over.
    expect(currentDayStreak(s.progress, NOW + 2 * DAY)).toBe(0);
    expect(done(s, 'd', NOW + 2 * DAY).progress.dayStreak).toBe(1);
  });

  it('repeat streak: each on-time occurrence raises the multiplier; late resets it', () => {
    const daily = { freq: 'day' as const, interval: 1, from: 'schedule' as const };
    let s = build([['gym', { repeat: daily, dueAt: NOW + 3600_000 }]]);
    s = done(s, 'gym', NOW); // on time: streak 1, ×1.1 → (10 + 5) × 1.1 = 17 (rounded)
    expect(tk(s, 'gym')!.streak).toBe(1);
    expect(s.progress.xp).toBe(17);
    // The archived copy of that occurrence shows what it earned.
    expect(tk(s, `gym~${NOW + 3600_000}`)!.xp).toBe(17);
    // Next occurrence, on time again (next day): streak 2, ×1.2, day streak 2 ×1.05.
    const due2 = tk(s, 'gym')!.dueAt!;
    const before = s.progress.xp;
    s = done(s, 'gym', due2 - 3600_000);
    expect(tk(s, 'gym')!.streak).toBe(2);
    expect(s.progress.xp - before).toBe(Math.round(15 * 1.2 * 1.05));
    // Late: the streak resets.
    const due3 = tk(s, 'gym')!.dueAt!;
    s = done(s, 'gym', due3 + 3600_000);
    expect(tk(s, 'gym')!.streak).toBe(0);
  });
});

describe('backups', () => {
  it('replace brings XP along when the backup has more, and never lowers it', () => {
    const rich = done(done(build([['a'], ['b']]), 'a'), 'b');
    const fresh = build([['x']]);
    expect(apply(fresh, replaceOp(fresh, toDocument(rich))!).state.progress.xp).toBe(20);
    expect(apply(rich, replaceOp(rich, toDocument(fresh))!).state.progress.xp).toBe(20);
  });
});
