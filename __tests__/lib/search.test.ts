/**
 * __tests__/lib/search.test.ts: search, filters (lib/search.ts) and bulk actions (lib/bulk.ts).
 */
import { completeMany, deleteMany, editMany, groupMany, moveManyTo, purgeMany, selectionRoots, sortChildren, trashed } from '@/lib/bulk';
import { flattenActive } from '@/lib/flatten';
import { apply, type Op } from '@/lib/ops';
import { matcher, matchRange, normalize, searchActive, searchCompleted } from '@/lib/search';
import type { TasksState } from '@/lib/types';

import { build, ids, outline, shape, tk } from '../helpers/tree';

const NOW = 1_000_000;
const s = build([
  [
    'work',
    [
      ['Café order', { notes: 'oat milk' }],
      ['notes', { collapsed: true }, [['draft', { priority: 3 }]]],
    ],
  ],
  ['home', [['bank', { dueAt: NOW - 1 }]]],
  ['done trip', { done: true, updatedAt: 5 }, [['pack', { done: true }]]],
]);

/** Applies an op, checks it undoes exactly, returns the new tree. */
function run(st: TasksState, op: Op | null): TasksState {
  expect(op).not.toBeNull();
  const r = apply(st, op!);
  expect(shape(apply(r.state, r.inverse).state)).toEqual(shape(st));
  return r.state;
}

describe('search', () => {
  it('ignores case and accents, and searches notes too', () => {
    expect(normalize('Café')).toBe('cafe');
    expect(outline(searchActive(s, matcher('cafe', 'all', NOW)!))).toEqual(['work', '  Café order']);
    expect(outline(searchActive(s, matcher('OAT', 'all', NOW)!))).toEqual(['work', '  Café order']);
  });

  it('keeps the tree shape: ancestors are shown as dimmed context, collapsed groups opened', () => {
    const rows = searchActive(s, matcher('draft', 'all', NOW)!);
    expect(outline(rows)).toEqual(['work', '  notes', '    draft']);
    expect(rows.map((r) => r.context)).toEqual([true, true, false]);
  });

  it('filter chips', () => {
    expect(outline(searchActive(s, matcher('', 'high', NOW)!))).toEqual(['work', '  notes', '    draft']);
    expect(outline(searchActive(s, matcher('', 'overdue', NOW)!))).toEqual(['home', '  bank']);
    expect(matcher('', 'all', NOW)).toBeNull(); // nothing to search: normal list
  });

  it('searches the COMPLETED tab separately', () => {
    expect(outline(searchCompleted(s, matcher('pack', 'all', NOW)!))).toEqual(['done trip', '  pack']);
    expect(outline(searchActive(s, matcher('pack', 'all', NOW)!))).toEqual([]);
  });

  it('finds the match position for highlighting, accents included', () => {
    expect(matchRange('Café order', 'cafe')).toEqual({ start: 0, end: 4 });
    expect(matchRange('my order', 'ORD')).toEqual({ start: 3, end: 6 });
    expect(matchRange('nothing', 'zzz')).toBeNull();
  });
});

describe('bulk actions', () => {
  it('selecting a parent includes its subtree: only roots are acted on', () => {
    expect(selectionRoots(s, ['draft', 'work', 'bank'])).toEqual(['work', 'bank']);
  });

  it('DONE, PRI and DEL each apply to every root as one undo step', () => {
    expect(tk(run(s, completeMany(s, ['bank', 'draft'], 1)), 'bank')!.done).toBe(true);
    const pri = run(s, editMany(s, ['bank', 'home'], { priority: 2 }, 1));
    expect([tk(pri, 'home')!.priority, tk(pri, 'bank')!.priority]).toEqual([2, 0]); // bank is inside home: only the root changes
    const del = run(s, deleteMany(s, ['bank', 'notes'], 1));
    expect(outline(flattenActive(del))).toEqual(['work', '  Café order', 'home']);
  });

  it('MOVE puts the roots at the end of the destination, refusing their own subtree', () => {
    const moved = run(s, moveManyTo(s, ['bank', 'draft'], 'work', 1));
    expect(outline(flattenActive(moved))).toEqual(['work', '  Café order', '  notes', '  draft', '  bank', 'home']);
    expect(moveManyTo(s, ['work'], 'draft', 1)).toBeNull();
  });

  it('GROUP wraps the roots in a new parent where the first one was', () => {
    const r = groupMany(s, ['home', 'work'], 'g', 1)!;
    const grouped = run(s, r.op);
    expect(outline(flattenActive(grouped)).slice(0, 3)).toEqual(['g', '  work', '    Café order']);
  });
});

describe('sort subtasks', () => {
  const t = build([
    [
      'p',
      [
        ['b', { priority: 1, dueAt: 30 }],
        ['C', { priority: 3 }],
        ['a', { priority: 3, dueAt: 10 }],
      ],
    ],
  ]);
  it('by priority (stable), by due date (undated last) and A–Z', () => {
    expect(run(t, sortChildren(t, 'p', 'priority', 1)).children.p).toEqual(['C', 'a', 'b']);
    expect(run(t, sortChildren(t, 'p', 'due', 1)).children.p).toEqual(['a', 'b', 'C']);
    expect(run(t, sortChildren(t, 'p', 'alpha', 1)).children.p).toEqual(['a', 'b', 'C']);
  });
  it('returns null when already sorted', () => {
    const sorted = apply(t, sortChildren(t, 'p', 'alpha', 1)!).state;
    expect(sortChildren(sorted, 'p', 'alpha', 1)).toBeNull();
  });
});

describe('trash', () => {
  const tr = build([['a', { deletedAt: 5 }, [['inner', { deletedAt: 6 }]]], ['b', [['c', { deletedAt: 9 }]]], ['live']]);
  it('lists deleted roots newest first (a deleted child of a deleted parent is not listed twice)', () => {
    expect(trashed(tr).map((t) => t.id)).toEqual(['c', 'a']);
  });
  it('DELETE NOW / EMPTY TRASH remove them for good', () => {
    expect(ids(run(tr, purgeMany(tr, ['a', 'c'])))).toEqual(['b', 'live']);
  });
});
