/**
 * __tests__/components/foldFocus.test.ts: where a list stands when a task
 * opens or closes (components/list/useFoldFocus.ts, user request
 * 2026-10-17): an opened task whose subtasks don't fit on screen below it
 * scrolls up to the top; a closed one never moves (the list keeps the room
 * it needs at its end).
 */
import { blockEnd, focusOffset, slackNeeded, type ListView } from '@/components/list/useFoldFocus';
import type { Row } from '@/lib/flatten';

const rows = (...depths: number[]): Row[] => depths.map((depth, i) => ({ id: `r${i}`, depth, hasChildren: false, progress: { done: 0, total: 0 } }));

describe('blockEnd', () => {
  it("finds the last row of a task's listed subtasks, at any depth", () => {
    const list = rows(0, 1, 2, 1, 0, 1);
    expect(blockEnd(list, 0)).toBe(3);
    expect(blockEnd(list, 1)).toBe(2);
    expect(blockEnd(list, 4)).toBe(5);
  });

  it('is the row itself when nothing is listed under it', () => {
    expect(blockEnd(rows(0, 0, 0), 1)).toBe(1);
    expect(blockEnd(rows(0, 1), 1)).toBe(1);
  });
});

describe('focusOffset', () => {
  // The list scrolled to 1000, 600 tall, 100 of it covered by the quick-add bar: 1000–1500 shows.
  const view: ListView = { offset: 1000, height: 600, topTuck: 9, coveredBottom: 100 };

  it('stays when the opened task and all its subtasks fit on screen', () => {
    expect(focusOffset(1200, 1450, view)).toBeNull();
    expect(focusOffset(1000, 1500, view)).toBeNull(); // exactly fills the view
  });

  it("scrolls the task's row to the top when its subtasks run past the bottom", () => {
    expect(focusOffset(1300, 1700, view)).toBe(1300);
  });

  it('scrolls it to the top when its own row is cut off at the top', () => {
    expect(focusOffset(980, 1200, view)).toBe(980);
  });

  it('never asks for a scroll above the start of the list', () => {
    expect(focusOffset(-5, 2000, { ...view, offset: 0 })).toBe(0);
  });
});

describe('slackNeeded', () => {
  it('is nothing while the content still reaches past the bottom of the view', () => {
    expect(slackNeeded(2000, { offset: 1000, height: 600 })).toBe(0);
  });

  it('is what the view reaches past the content (a closed task near the end keeps its place)', () => {
    // The content now ends at 1400, but the view (1000–1600) is where the task was: keep 200.
    expect(slackNeeded(1400, { offset: 1000, height: 600 })).toBe(200);
  });

  it('rounds up, so the scroll position always stays valid', () => {
    expect(slackNeeded(1399.4, { offset: 1000, height: 600 })).toBe(201);
  });
});
