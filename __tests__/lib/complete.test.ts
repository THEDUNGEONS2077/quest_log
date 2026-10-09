/**
 * __tests__/lib/complete.test.ts: completion rules and COMPLETED actions (lib/complete.ts).
 */
import { archiveId, check, clearCompleted, runAgain, uncheck } from '@/lib/complete';
import { flattenActive, flattenCompleted } from '@/lib/flatten';
import { apply, editTask, type Op } from '@/lib/ops';
import type { TasksState } from '@/lib/types';

import { build, outline, shape, tk } from '../helpers/tree';

/** Applies an op and checks its undo restores the tree exactly. */
function run(s: TasksState, op: Op): TasksState {
  const r = apply(s, op);
  expect(shape(apply(r.state, r.inverse).state)).toEqual(shape(s));
  return r.state;
}

const done = (s: TasksState, id: string) => tk(s, id)!.done;

describe('check', () => {
  const s = build([['work', [['ship'], ['notes', [['draft'], ['proof']]]]], ['home']]);

  it('checking a parent completes its whole subtree in one op', () => {
    const r = check(s, 'notes', 5);
    const next = run(s, r.op);
    expect(['notes', 'draft', 'proof'].map((id) => done(next, id))).toEqual([true, true, true]);
    expect(tk(next, 'draft')!.doneAt).toBe(5);
    expect(done(next, 'work')).toBe(false); // ship is still open
    expect(r.completedTopLevel).toBeNull();
  });

  it('checking the last open child auto-completes parents, chaining up to top level', () => {
    let t = run(s, check(s, 'ship', 1).op);
    t = run(t, check(t, 'draft', 2).op);
    const r = check(t, 'proof', 3); // last open leaf under work
    const next = run(t, r.op);
    expect(r.autoCompleted).toEqual(['notes', 'work']);
    expect(r.completedTopLevel).toBe('work');
    expect(done(next, 'work')).toBe(true);
  });

  it('a done subtask stays on ACTIVE; a done top-level task moves to COMPLETED', () => {
    const next = run(s, check(s, 'home', 1).op);
    expect(outline(flattenActive(next))).not.toContain('home');
    expect(outline(flattenCompleted(next))).toEqual(['home']);
    const sub = run(s, check(s, 'ship', 1).op);
    expect(outline(flattenActive(sub))).toContain('  ship');
  });

  it('a just-checked top-level task can be kept on ACTIVE while it animates', () => {
    const next = run(s, check(s, 'home', 1).op);
    expect(outline(flattenActive(next, { keep: new Set(['home']) }))).toContain('home');
  });

  it('ignores deleted subtasks: they neither get checked nor block auto-complete', () => {
    const d = build([['p', [['open'], ['trashed', { deletedAt: 1 }]]]]);
    const r = check(d, 'open', 2);
    const next = run(d, r.op);
    expect(r.completedTopLevel).toBe('p');
    expect(done(next, 'trashed')).toBe(false);
  });

  it('bubbles updatedAt to ancestors (COMPLETED sorts by it)', () => {
    expect(tk(run(s, check(s, 'draft', 9).op), 'work')!.updatedAt).toBe(9);
  });
});

describe('uncheck', () => {
  const all = build([
    [
      'p',
      { done: true },
      [
        ['a', { done: true }],
        ['b', { done: true }],
      ],
    ],
  ]);

  it('unchecking a child also unchecks its done ancestors', () => {
    const next = run(all, uncheck(all, 'a', 1));
    expect([done(next, 'p'), done(next, 'a'), done(next, 'b')]).toEqual([false, false, true]);
  });

  it('restore (subtree) unchecks everything below too', () => {
    const next = run(all, uncheck(all, 'p', 1, { subtree: true }));
    expect([done(next, 'p'), done(next, 'a'), done(next, 'b')]).toEqual([false, false, false]);
    expect(outline(flattenActive(next))).toEqual(['p', '  a', '  b']); // back in its original place
  });
});

describe('runAgain', () => {
  it('copies the subtree as fresh, unchecked tasks at the end of ACTIVE', () => {
    const s = build([
      [
        'list',
        { done: true, notes: 'n', priority: 2 },
        [
          ['x', { done: true }],
          ['gone', { done: true, deletedAt: 1 }],
        ],
      ],
      ['other'],
    ]);
    let n = 0;
    const { op, rootId } = runAgain(s, 'list', 7, () => `c${n++}`);
    const next = run(s, op);
    // The copy is the newest quest, so it shows first; the deleted subtask isn't copied.
    expect(outline(flattenActive(next))).toEqual(['c0', '  c1', 'other']);
    expect(tk(next, rootId)).toMatchObject({ title: 'list', done: false, notes: 'n', priority: 2, createdAt: 7 });
    expect(tk(next, 'c1')).toMatchObject({ title: 'x', done: false, parentId: 'c0' });
  });

  it("goes back to the quest's tab, not to MAIN", () => {
    const s = build([['chores', { done: true, category: 'misc' }]]);
    const { op, rootId } = runAgain(s, 'chores', 7, () => 'c0');
    expect(tk(run(s, op), rootId)!.category).toBe('misc');
  });
});

describe('clearCompleted', () => {
  const DAY = 86_400_000;
  const NOW = 100 * DAY;
  const s = build([['old', { done: true, updatedAt: NOW - 40 * DAY }], ['recent', { done: true, updatedAt: NOW - DAY }], ['open']]);

  it('moves only completed tasks older than the cutoff to Trash', () => {
    const r = clearCompleted(s, NOW, 30)!;
    expect(r.count).toBe(1);
    const next = run(s, r.op);
    expect(tk(next, 'old')!.deletedAt).toBe(NOW);
    expect(tk(next, 'recent')!.deletedAt).toBeNull();
  });

  it('clears all completed tasks, and returns null when there is nothing to clear', () => {
    expect(clearCompleted(s, NOW, null)!.count).toBe(2);
    expect(clearCompleted(build([['open']]), NOW, null)).toBeNull();
  });
});

describe('repeating tasks (PLAN §9.9)', () => {
  const DAY = 86_400_000;
  const due = new Date(2026, 9, 7, 9).getTime(); // Wed 09:00
  const daily = { freq: 'day' as const, interval: 1, from: 'schedule' as const };

  it('a top-level repeating task advances, resets its subtasks and archives a completed copy', () => {
    const s = build([['standup', { dueAt: due, notify: true, repeat: daily }, [['notes', { done: true }], ['blockers']]]]);
    const r = check(s, 'standup', due + 60_000);
    const next = run(s, r.op);
    expect(r.advanced).toEqual({ id: 'standup', nextDue: due + DAY });
    expect(r.completedTopLevel).toBeNull();
    // Live task: still open, next date, subtasks unchecked.
    expect(tk(next, 'standup')).toMatchObject({ done: false, dueAt: due + DAY });
    expect(tk(next, 'notes')!.done).toBe(false);
    // Archived copy on COMPLETED, marked with its source, no repeat or reminder.
    const copy = tk(next, archiveId('standup', due))!;
    expect(copy).toMatchObject({ done: true, repeatSourceId: 'standup', repeat: null, notify: false, parentId: null });
    // It stays on its quest's tab: DAILY came from the daily repeat, so it's stored now (bug 2026-10-09).
    expect(copy.category).toBe('daily');
    expect(outline(flattenCompleted(next, new Set([copy.id])))).toEqual([
      copy.id,
      `  ${archiveId('notes', due)}`,
      `  ${archiveId('blockers', due)}`,
    ]);
  });

  it('never archives the same occurrence twice (deterministic copy IDs)', () => {
    const s = build([['standup', { dueAt: due, repeat: daily }]]);
    const once = run(s, check(s, 'standup', due).op);
    // Replay of the same occurrence (its copy exists, the due date is back at `due`):
    // the task advances again, but no second copy is inserted.
    const replay = apply(once, editTask(once, 'standup', { dueAt: due }, due)).state;
    expect(JSON.stringify(check(replay, 'standup', due).op)).not.toContain('"insert"');
  });

  it('a repeating subtask advances in place without archiving', () => {
    const s = build([['home', [['water plants', { dueAt: due, repeat: daily }], ['other']]]]);
    const r = check(s, 'water plants', due);
    const next = run(s, r.op);
    expect(tk(next, 'water plants')).toMatchObject({ done: false, dueAt: due + DAY });
    expect(tk(next, archiveId('water plants', due))).toBeUndefined();
  });

  it('checking the last item of a repeating checklist group resets the whole group', () => {
    const s = build([['weekly review', { dueAt: due, repeat: { ...daily, freq: 'week' } }, [['inbox', { done: true }], ['calendar']]]]);
    const r = check(s, 'calendar', due);
    const next = run(s, r.op);
    expect(r.advanced!.id).toBe('weekly review');
    expect(['weekly review', 'inbox', 'calendar'].map((id) => tk(next, id)!.done)).toEqual([false, false, false]);
    expect(tk(next, 'weekly review')!.dueAt).toBe(due + 7 * DAY);
  });

  it('a repeat without a due date completes normally', () => {
    const s = build([['x', { repeat: daily }]]);
    expect(check(s, 'x', due).completedTopLevel).toBe('x');
  });
});
