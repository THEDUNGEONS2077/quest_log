/**
 * __tests__/lib/title.test.ts: objectives are stored with a capital first
 * letter and shown with every word capitalized (lib/title.ts, user requests
 * 2026-10-09).
 */
import { capitalizeFirst, capitalizeWords, shownTitle, titleFor } from '@/lib/title';

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

describe('capitalizeWords', () => {
  it('capitals at the start of every word, however it was typed', () => {
    expect(capitalizeWords('buy oat milk')).toBe('Buy Oat Milk');
    expect(capitalizeWords('Buy oat milk')).toBe('Buy Oat Milk');
    expect(capitalizeWords('call  the\tbank')).toBe('Call  The\tBank'); // spacing kept
  });

  it('looks past opening brackets and quotes, but not into a word', () => {
    expect(capitalizeWords('(maybe) "call" mom')).toBe('(Maybe) "Call" Mom');
    expect(capitalizeWords("don't check-in")).toBe("Don't Check-in");
  });

  it('leaves words that are not letters, or already have a capital, alone', () => {
    expect(capitalizeWords('3 eggs at 5pm #home')).toBe('3 Eggs At 5pm #home');
    expect(capitalizeWords('fix iPhone and NASA eBay')).toBe('Fix iPhone And NASA eBay');
  });

  it('never changes the length (search highlights are ranges into the stored title)', () => {
    for (const t of ['ßtraße und weg', 'buy oat milk', '(a) b']) expect(capitalizeWords(t)).toHaveLength(t.length);
  });
});

describe('titleFor / shownTitle', () => {
  it('stores objectives with a capital first letter only; quests stay as typed', () => {
    expect(titleFor('q1', 'buy oat milk')).toBe('Buy oat milk');
    expect(titleFor(null, 'groceries')).toBe('groceries');
  });

  it('shows every word of an objective capitalized; quests as typed', () => {
    expect(shownTitle({ title: 'buy oat milk', parentId: 'q1' })).toBe('Buy Oat Milk');
    expect(shownTitle({ title: 'plan the weekend', parentId: null })).toBe('plan the weekend');
  });
});
