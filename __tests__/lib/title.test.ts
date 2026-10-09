/**
 * __tests__/lib/title.test.ts: objectives start with a capital letter
 * (lib/title.ts, user request 2026-10-09).
 */
import { capitalizeFirst, shownTitle, titleFor } from '@/lib/title';

describe('capitalizeFirst', () => {
  it('upper-cases a lowercase first letter, any alphabet', () => {
    expect(capitalizeFirst('buy milk')).toBe('Buy milk');
    expect(capitalizeFirst('éclair')).toBe('Éclair');
    expect(capitalizeFirst('ωmega')).toBe('Ωmega');
  });

  it('leaves everything else as it is', () => {
    for (const t of ['', 'Already', '3 eggs', '(maybe) call', '#tag', ' space first', '😀 party']) {
      expect(capitalizeFirst(t)).toBe(t);
    }
  });

  it('never changes the length (search highlights are ranges into the stored title)', () => {
    expect(capitalizeFirst('ßtraße')).toBe('ßtraße'); // its capital is "SS"
  });
});

describe('titleFor / shownTitle', () => {
  it('capitalizes objectives only; quests stay as typed', () => {
    expect(titleFor('q1', 'milk')).toBe('Milk');
    expect(titleFor(null, 'groceries')).toBe('groceries');
    expect(shownTitle({ title: 'milk', parentId: 'q1' })).toBe('Milk');
    expect(shownTitle({ title: 'groceries', parentId: null })).toBe('groceries');
  });
});
