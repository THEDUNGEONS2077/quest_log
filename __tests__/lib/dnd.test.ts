/**
 * __tests__/lib/dnd.test.ts: drop targeting (lib/dnd.ts).
 */
import { depthRange, dropOp, dropTarget, type DragRow, moveBy, resolveDrop } from '@/lib/dnd';
import { flattenActive } from '@/lib/flatten';
import { apply } from '@/lib/ops';
import { findTask } from '@/lib/taskMap';
import { childIds, subtreeIds } from '@/lib/tree';
import type { TasksState } from '@/lib/types';

import { build, outline, shape } from '../helpers/tree';

const INDENT = 24;
const H = 52;

/** Rows as the drag UI would see them: visible rows minus the dragged subtree, stacked 52 pt each. */
function dragRows(s: TasksState, draggedId: string): DragRow[] {
  const hidden = new Set(subtreeIds(s, draggedId));
  return flattenActive(s)
    .filter((r) => !hidden.has(r.id))
    .map((r, i) => ({ id: r.id, depth: r.depth, top: i * H, height: H }));
}

// work
//   ship
//   notes
//     draft
// home
// bank   ← dragged in most tests
const s = build([['work', [['ship'], ['notes', [['draft']]]]], ['home'], ['bank']]);
const rows = dragRows(s, 'bank'); // work ship notes draft home

/** Drops "bank" at gap/depth and returns the new outline (also checks undo). */
function drop(gap: number, depth: number): string[] {
  const op = dropOp(s, rows, { gap, depth }, 'bank', null, 1)!;
  const r = apply(s, op);
  expect(shape(apply(r.state, r.inverse).state)).toEqual(shape(s));
  return outline(flattenActive(r.state));
}

describe('depthRange', () => {
  it('runs from the next row’s depth to the previous row’s depth + 1', () => {
    expect(depthRange(rows, 0)).toEqual({ min: 0, max: 0 }); // top of the list
    expect(depthRange(rows, 4)).toEqual({ min: 0, max: 3 }); // after "draft" (depth 2), before "home" (0)
    expect(depthRange(rows, 3)).toEqual({ min: 2, max: 2 }); // between notes and its child draft
  });
});

describe('dropTarget', () => {
  it('picks the gap from the finger’s height and the depth from sideways movement, clamped', () => {
    expect(dropTarget(rows, 4 * H + 10, 0, 0, INDENT)).toEqual({ gap: 4, depth: 0 }); // upper half of "home"
    expect(dropTarget(rows, 4 * H + 10, 0, 2 * INDENT, INDENT)).toEqual({ gap: 4, depth: 2 });
    expect(dropTarget(rows, 4 * H + 10, 0, 9 * INDENT, INDENT)).toEqual({ gap: 4, depth: 3 }); // clamped to max
    expect(dropTarget(rows, 99 * H, 0, -INDENT, INDENT)).toEqual({ gap: 5, depth: 0 }); // below everything
  });
});

describe('dropping', () => {
  it('reorders at the same level', () => {
    expect(drop(0, 0)).toEqual(['bank', 'work', '  ship', '  notes', '    draft', 'home']);
  });

  it('nests deeper by dragging right', () => {
    expect(drop(4, 1)).toEqual(['work', '  ship', '  notes', '    draft', '  bank', 'home']);
    expect(drop(4, 3)).toEqual(['work', '  ship', '  notes', '    draft', '      bank', 'home']);
  });

  it('becomes the first child when dropped between a parent and its first child', () => {
    expect(drop(3, 2)).toEqual(['work', '  ship', '  notes', '    bank', '    draft', 'home']);
  });

  it('dropping in place is a no-op (no undo entry)', () => {
    expect(dropOp(s, rows, { gap: 5, depth: 0 }, 'bank', null, 1)).toBeNull();
  });

  it('places correctly among hidden (done top-level) siblings', () => {
    const t = build([['a'], ['done', { done: true }], ['b'], ['x']]);
    const r = dragRows(t, 'x'); // a b (done is on COMPLETED)
    expect(resolveDrop(t, r, { gap: 1, depth: 0 }, 'x', null)).toEqual({ parentId: null, index: 1 }); // right after "a"
  });
});

describe('moveBy (accessibility Move up / Move down)', () => {
  const live = (id: string) => findTask(s, id)?.deletedAt === null;
  it('swaps with the neighbouring sibling; null at the ends', () => {
    // Quests display newest-first (lib/flatten.ts), so the stored order is what moves.
    const up = apply(s, moveBy(s, 'bank', -1, 1, live)!).state;
    expect(childIds(up, null).slice(-2)).toEqual(['bank', 'home']);
    const down = apply(s, moveBy(s, 'ship', 1, 1, live)!).state;
    expect(outline(flattenActive(down)).slice(1, 3)).toEqual(['  notes', '    draft']);
    expect(moveBy(s, 'work', -1, 1, live)).toBeNull();
    expect(moveBy(s, 'bank', 1, 1, live)).toBeNull();
  });
});
