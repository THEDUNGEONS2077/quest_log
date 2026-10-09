/**
 * __tests__/lib/quests.test.ts: quest categories (lib/quests.ts), and the
 * repair for completed daily copies filed under MAIN (bug 2026-10-09).
 */
import { apply } from '@/lib/ops';
import { onTab, pinArchivedCategories, questCategory } from '@/lib/quests';

import { build, tk } from '../helpers/tree';

const daily = { freq: 'day', interval: 1, from: 'schedule' } as const;

describe('questCategory', () => {
  it('uses the stored category, else derives it from a daily repeat', () => {
    expect(questCategory({ category: 'misc', repeat: daily })).toBe('misc');
    expect(questCategory({ repeat: daily })).toBe('daily');
    expect(questCategory({ repeat: null })).toBe('main');
  });
});

describe('pinArchivedCategories', () => {
  it("stores the quest's category on completed copies that have none", () => {
    const s = build([
      ['standup', { repeat: daily }],
      ['copy', { done: true, repeatSourceId: 'standup' }], // saved before v1.5.2: falls to MAIN
      ['gym-copy', { done: true, repeatSourceId: 'gym' }], // its quest is gone: left alone
      ['pinned', { done: true, repeatSourceId: 'standup', category: 'misc' }], // already stored
      ['plain', { done: true }],
    ]);
    expect(onTab(tk(s, 'copy')!, 'daily')).toBe(false);
    const op = pinArchivedCategories(s)!;
    const next = apply(s, op).state;
    expect(onTab(tk(next, 'copy')!, 'daily')).toBe(true);
    expect(tk(next, 'gym-copy')!.category).toBeUndefined();
    expect(tk(next, 'pinned')!.category).toBe('misc');
    expect(tk(next, 'plain')!.category).toBeUndefined();
    // Idempotent: nothing left to do.
    expect(pinArchivedCategories(next)).toBeNull();
  });
});
