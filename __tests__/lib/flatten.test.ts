/**
 * __tests__/lib/flatten.test.ts: ACTIVE and COMPLETED row derivation (lib/flatten.ts).
 */
import { flattenActive, flattenCompleted } from '@/lib/flatten';

import { build, outline } from '../helpers/tree';

describe('flattenActive', () => {
  it('walks depth-first with depths and progress', () => {
    const s = build([['work', [['ship'], ['notes', [['draft', { done: true }], ['proof']]]]], ['home']]);
    const rows = flattenActive(s);
    expect(outline(rows)).toEqual(['work', '  ship', '  notes', '    draft', '    proof', 'home']);
    const notes = rows.find((r) => r.id === 'notes')!;
    expect(notes.hasChildren).toBe(true);
    expect(notes.progress).toEqual({ done: 1, total: 2 });
    expect(rows.find((r) => r.id === 'home')!.hasChildren).toBe(false);
  });

  it('keeps done subtasks in place but moves done top-level tasks out (PLAN §9.5)', () => {
    const s = build([
      ['a', [['a1', { done: true }]]],
      ['b', { done: true }],
    ]);
    expect(outline(flattenActive(s))).toEqual(['a', '  a1']);
  });

  it('hides collapsed subtrees but shows the collapsed row', () => {
    const s = build([['a', { collapsed: true }, [['a1'], ['a2']]], ['b']]);
    const rows = flattenActive(s);
    expect(outline(rows)).toEqual(['a', 'b']);
    expect(rows[0]!.hasChildren).toBe(true);
  });

  it('skips soft-deleted tasks with their subtrees, and leaves them out of progress', () => {
    const s = build([['a', [['gone', { deletedAt: 1 }, [['inside']]], ['kept']]]]);
    const rows = flattenActive(s);
    expect(outline(rows)).toEqual(['a', '  kept']);
    expect(rows[0]!.progress).toEqual({ done: 0, total: 1 });
  });

  it('zooms into a subtree; done children of the zoom root stay visible', () => {
    const s = build([
      [
        'work',
        [
          ['x', { done: true }],
          ['y', [['y1']]],
        ],
      ],
      ['home'],
    ]);
    expect(outline(flattenActive(s, { zoomRootId: 'work' }))).toEqual(['x', 'y', '  y1']);
  });
});

describe('flattenCompleted', () => {
  const s = build([
    ['old', { done: true, updatedAt: 100 }, [['o1', { done: true }]]],
    ['open'],
    ['new', { done: true, updatedAt: 300 }],
    ['mid', { done: true, updatedAt: 200 }],
    ['trashed', { done: true, updatedAt: 999, deletedAt: 1 }],
  ]);

  it('lists done top-level tasks, newest modified first, subtrees collapsed', () => {
    expect(outline(flattenCompleted(s))).toEqual(['new', 'mid', 'old']);
  });

  it('expands a subtree when asked', () => {
    expect(outline(flattenCompleted(s, new Set(['old'])))).toEqual(['new', 'mid', 'old', '  o1']);
  });
});

describe('quests: newest first, by category tab (user request 2026-10-09)', () => {
  const daily = { freq: 'day' as const, interval: 1, from: 'schedule' as const };
  const s = build([
    [
      'old',
      { updatedAt: 1 },
      [
        ['a1', { updatedAt: 9 }],
        ['a2', { updatedAt: 1 }],
      ],
    ],
    ['newest', { updatedAt: 5 }],
    ['gym', { updatedAt: 3, repeat: daily, dueAt: 10 }],
    ['junk', { updatedAt: 4, category: 'misc' }],
  ]);

  it('lists quests by last modified, newest first; objectives keep their order', () => {
    expect(outline(flattenActive(s))).toEqual(['newest', 'junk', 'gym', 'old', '  a1', '  a2']);
  });

  it('filters quests by tab; older quests get a derived category', () => {
    expect(outline(flattenActive(s, { category: 'daily' }))).toEqual(['gym']); // repeats daily
    expect(outline(flattenActive(s, { category: 'misc' }))).toEqual(['junk']);
    expect(outline(flattenActive(s, { category: 'main' }))).toEqual(['newest', 'old', '  a1', '  a2']);
  });

  it('a zoomed-in quest ignores the tab and keeps manual order', () => {
    expect(outline(flattenActive(s, { zoomRootId: 'old', category: 'misc' }))).toEqual(['a1', 'a2']);
  });
});
