/**
 * __tests__/lib/enterInsert.test.ts: telling Enter from a paste in multiline
 * editors (lib/paste.ts isEnterInsert). The web build inserts a line break
 * on Enter; a real paste must still become several tasks.
 */
import { isEnterInsert } from '@/lib/paste';

describe('isEnterInsert', () => {
  it('is Enter: one line break added to the same text, anywhere', () => {
    expect(isEnterInsert('Buy milk', 'Buy milk\n')).toBe(true);
    expect(isEnterInsert('Buy milk', 'Buy\n milk')).toBe(true);
    expect(isEnterInsert('', '\n')).toBe(true);
  });

  it('is a paste: several lines, or text that changed besides the break', () => {
    expect(isEnterInsert('', 'milk\neggs')).toBe(false);
    expect(isEnterInsert('a', 'a\nb\nc')).toBe(false);
    expect(isEnterInsert('Buy', 'Buy milk\n')).toBe(false);
  });

  it('is neither without a line break', () => {
    expect(isEnterInsert('a', 'ab')).toBe(false);
  });
});
