/**
 * __tests__/components/useOwnedText.test.tsx: text fields own their text
 * while typing (components/edit/useOwnedText.ts). Bug 2026-10-09: writing
 * the stored value back on every keystroke broke Android keyboard
 * suggestions ("@1pm" → "@1p1pm").
 */
import { act, renderHook } from '@testing-library/react-native';

import { useOwnedText } from '@/components/edit/useOwnedText';

describe('useOwnedText', () => {
  it('typing never pushes text back into the field (the epoch stays)', async () => {
    const { result, rerender } = await renderHook(({ stored }: { stored: string }) => useOwnedText(stored), {
      initialProps: { stored: 'Call' },
    });
    // Each keystroke: the field reports the text, then the store saves the same text.
    for (const t of ['Call @', 'Call @1', 'Call @1p', 'Call @1pm']) {
      await act(() => result.current.typed(t));
      await rerender({ stored: t });
    }
    expect(result.current.epoch).toBe(0);
  });

  it('an outside change (undo, shorthand applied, paste split) replaces the field once', async () => {
    const { result, rerender } = await renderHook(({ stored }: { stored: string }) => useOwnedText(stored), {
      initialProps: { stored: 'Call @1pm' },
    });
    await rerender({ stored: 'Call' }); // e.g. UNDO
    expect(result.current.epoch).toBe(1);
    await rerender({ stored: 'Call' });
    expect(result.current.epoch).toBe(1); // no repeat for the same text
  });
});
