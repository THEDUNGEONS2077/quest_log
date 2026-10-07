/**
 * __tests__/lib/complete.test.ts: completion rules and COMPLETED actions (lib/complete.ts).
 */
import { check, clearCompleted, runAgain, uncheck } from '@/lib/complete';
import { flattenActive, flattenCompleted } from '@/lib/flatten';
import { apply, type Op } from '@/lib/ops';
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
    expect(outline(flattenActive(next))).toEqual(['other', 'c0', '  c1']); // deleted subtask not copied
    expect(tk(next, rootId)).toMatchObject({ title: 'list', done: false, notes: 'n', priority: 2, createdAt: 7 });
    expect(tk(next, 'c1')).toMatchObject({ title: 'x', done: false, parentId: 'c0' });
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
