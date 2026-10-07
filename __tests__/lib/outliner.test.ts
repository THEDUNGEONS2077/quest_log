/**
 * __tests__/lib/outliner.test.ts: Enter and Backspace rules (lib/outliner.ts)
 * and paste-to-tree (lib/paste.ts).
 */
import { flattenActive } from '@/lib/flatten';
import { apply, type Op } from '@/lib/ops';
import { pressBackspaceAtStart, pressEnter } from '@/lib/outliner';
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

describe('pressEnter', () => {
  const s = build([['work', [['ship it'], ['proof']]], ['home']]);

  it('at the end: adds an empty sibling below and focuses it', () => {
    const r = pressEnter(s, 'ship it', 7, 'n', 1);
    const next = run(s, r.op);
    expect(childIds(next, 'work')).toEqual(['ship it', 'n', 'proof']);
    expect(tk(next, 'n')!.title).toBe('');
    expect(r.focus).toEqual({ id: 'n', caret: 0 });
  });

  it('in the middle: splits the title at the caret', () => {
    const r = pressEnter(s, 'ship it', 4, 'n', 1);
    const next = run(s, r.op);
    expect([tk(next, 'ship it')!.title, tk(next, 'n')!.title]).toEqual(['ship', ' it']);
  });

  it('on an empty nested task: outdents it, keeping focus', () => {
    const e = build([['work', [['a'], ['']]]]);
    const r = pressEnter(e, '', 0, 'n', 1);
    const next = run(e, r.op);
    expect(outline(flattenActive(next))).toEqual(['work', '  a', '']);
    expect(r.focus).toEqual({ id: '', caret: 0 });
  });

  it('on an empty top-level task: discards it and stops editing', () => {
    const e = build([['a'], ['']]);
    const r = pressEnter(e, '', 0, 'n', 1);
    expect(outline(flattenActive(run(e, r.op)))).toEqual(['a']);
    expect(r.focus).toBeNull();
  });
});

describe('pressBackspaceAtStart', () => {
  it('on an empty task: deletes it and focuses the end of the row above', () => {
    const s = build([['work', [['ship'], ['']]]]);
    const r = pressBackspaceAtStart(s, '', 'ship', 1);
    expect(childIds(run(s, r.op), 'work')).toEqual(['ship']);
    expect(r.focus).toEqual({ id: 'ship', caret: 4 });
  });

  it('on a non-empty task: merges into the row above, caret at the join', () => {
    const s = build([['ship '], ['v2']]);
    const r = pressBackspaceAtStart(s, 'v2', 'ship ', 1);
    const next = run(s, r.op);
    expect(tk(next, 'ship ')!.title).toBe('ship v2');
    expect(tk(next, 'v2')).toBeUndefined();
    expect(r.focus).toEqual({ id: 'ship ', caret: 5 });
  });

  it('does nothing when either task has children', () => {
    const s = build([['a', [['a1']]], ['b']]);
    expect(pressBackspaceAtStart(s, 'b', 'a1', 1).op).not.toBeNull(); // a1 has no children: merges
    expect(pressBackspaceAtStart(s, 'a', null, 1).op).toBeNull(); // first row
    const t = build([['a'], ['b', [['b1']]]]);
    expect(pressBackspaceAtStart(t, 'b', 'a', 1).op).toBeNull(); // b has children
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
