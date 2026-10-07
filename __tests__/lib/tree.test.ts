/**
 * __tests__/lib/tree.test.ts: read-only tree queries (lib/tree.ts).
 */
import {
  ancestors,
  childIds,
  createEmptyState,
  depthOf,
  indexInParent,
  isInSubtree,
  liveChildIds,
  previousLiveSibling,
  subtreeIds,
  topLevelOf,
} from '@/lib/tree';
import { taskCount } from '@/lib/taskMap';
import { ROOT } from '@/lib/types';

import { build } from '../helpers/tree';

// work
//   ship
//   notes
//     draft
//     proof
// home (deleted child: old)
const state = build([
  ['work', [['ship'], ['notes', [['draft'], ['proof']]]]],
  ['home', [['old', { deletedAt: 5 }], ['bank']]],
]);

describe('createEmptyState', () => {
  it('has an empty root list and no tasks', () => {
    const s = createEmptyState();
    expect(s.children[ROOT]).toEqual([]);
    expect(taskCount(s)).toBe(0);
  });
});

describe('queries', () => {
  it('lists children in order, with [] for leaves', () => {
    expect(childIds(state, null)).toEqual(['work', 'home']);
    expect(childIds(state, 'notes')).toEqual(['draft', 'proof']);
    expect(childIds(state, 'ship')).toEqual([]);
  });

  it('finds ancestors nearest first, top-level task and depth', () => {
    expect(ancestors(state, 'proof')).toEqual(['notes', 'work']);
    expect(topLevelOf(state, 'proof')).toBe('work');
    expect(topLevelOf(state, 'work')).toBe('work');
    expect(depthOf(state, 'proof')).toBe(2);
    expect(indexInParent(state, 'proof')).toBe(1);
  });

  it('checks subtree membership', () => {
    expect(isInSubtree(state, 'draft', 'work')).toBe(true);
    expect(isInSubtree(state, 'work', 'work')).toBe(true);
    expect(isInSubtree(state, 'work', 'draft')).toBe(false);
  });

  it('lists a subtree in display order, root first', () => {
    expect(subtreeIds(state, 'work')).toEqual(['work', 'ship', 'notes', 'draft', 'proof']);
  });

  it('skips soft-deleted tasks for live siblings', () => {
    expect(liveChildIds(state, 'home')).toEqual(['bank']);
    expect(previousLiveSibling(state, 'bank')).toBeNull();
    expect(previousLiveSibling(state, 'proof')).toBe('draft');
  });

  it('throws on unknown IDs (caller bug)', () => {
    expect(() => ancestors(state, 'nope')).toThrow(/unknown task/);
  });
});
