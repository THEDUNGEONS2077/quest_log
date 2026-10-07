/**
 * __tests__/lib/outliner.test.ts: the Backspace rule (lib/outliner.ts) and
 * paste-to-tree (lib/paste.ts).
 */
import { flattenActive } from '@/lib/flatten';
import { apply, type Op } from '@/lib/ops';
import { deleteIfEmpty } from '@/lib/outliner';
import { parseOutline, pasteOp } from '@/lib/paste';
import { childIds } from '@/lib/tree';
import type { TasksState } from '@/lib/types';

import { build, outline, shape, tk } from '../helpers/tree';

/** Applies an op and checks its undo restores the tree exactly. */
function run(s: TasksState, op: Op | null): TasksState {
  expect(op).not.toBeNull();
  const r = apply(s, op!);
  expect(shape(apply(r.state, r.inverse).state)).toEqual(shape(s));
  return r.state;
}

describe('deleteIfEmpty (Backspace on an empty task)', () => {
  it('deletes an empty task and touches its parent', () => {
    const s = build([['work', [['ship'], ['']]]]);
    const next = run(s, deleteIfEmpty(s, '', 9));
    expect(childIds(next, 'work')).toEqual(['ship']);
    expect(tk(next, 'work')!.updatedAt).toBe(9);
  });

  it('never deletes a task that still has text or children', () => {
    expect(deleteIfEmpty(build([['a']]), 'a', 1)).toBeNull();
    expect(deleteIfEmpty(build([['', [['kid']]]]), '', 1)).toBeNull();
  });
});

describe('parseOutline', () => {
  it('reads nesting, bullets and checkboxes', () => {
    const text = 'Groceries\n  - milk\n  - [x] eggs\n    * free range\n\n* Call the bank\n1. first\n';
    expect(parseOutline(text)).toEqual([
      { title: 'Groceries', depth: 0, done: false },
      { title: 'milk', depth: 1, done: false },
      { title: 'eggs', depth: 1, done: true },
      { title: 'free range', depth: 2, done: false },
      { title: 'Call the bank', depth: 0, done: false },
      { title: 'first', depth: 0, done: false },
    ]);
  });

  it('detects 4-space and tab indents, and clamps jumps of more than one level', () => {
    expect(parseOutline('a\n    b\n        c').map((l) => l.depth)).toEqual([0, 1, 2]);
    expect(parseOutline('a\n\tb\n\t\tc').map((l) => l.depth)).toEqual([0, 1, 2]);
    expect(parseOutline('a\n      deep').map((l) => l.depth)).toEqual([0, 1]);
  });

  it('caps very long lines at 500 characters', () => {
    expect(parseOutline('x'.repeat(600))[0]!.title).toHaveLength(500);
  });
});

describe('pasteOp', () => {
  it('inserts a nested tree as one undo step', () => {
    const s = build([['work', [['existing']]], ['home']]);
    let n = 0;
    const { op, ids } = pasteOp(s, parseOutline('a\n  a1\n  a2\nb'), 'work', 1, 5, () => `p${n++}`);
    const next = run(s, op);
    expect(ids).toHaveLength(4);
    expect(outline(flattenActive(next))).toEqual(['work', '  existing', '  p0', '    p1', '    p2', '  p3', 'home']);
    expect(tk(next, 'p0')!.title).toBe('a');
    expect(tk(next, 'work')!.updatedAt).toBe(5);
  });
});
