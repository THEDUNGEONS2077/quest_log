/**
 * __tests__/components/motion.test.tsx: shared motion behavior (animation
 * pass 2026-10-09): list rows animate only real changes, and the toast
 * leaves the way it came instead of vanishing.
 */
import { act, render, renderHook, screen } from '@testing-library/react-native';

import { useSameItem } from '@/components/common/motion';
import { Toast } from '@/components/overlays/Toast';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { bundleStore, StoreProvider } from '@/store/react';
import { duration } from '@/theme';

describe('useSameItem', () => {
  it('reports the same item until the row is reused for another one', async () => {
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useSameItem(id), { initialProps: { id: 'a' } });
    expect(result.current()).toBe(true); // mounting: nothing changed
    expect(result.current()).toBe(true); // a change on the same task: animate
    await rerender({ id: 'b' });
    expect(result.current()).toBe(false); // recycled onto another task: jump
    expect(result.current()).toBe(true);
  });
});

describe('Toast', () => {
  it('stays drawn while it fades out, not tappable, then goes', async () => {
    jest.useFakeTimers();
    try {
      const store = createAppStore({ kv: createMemoryKV(), now: () => 1_000, newId: () => 'x' });
      await render(
        <StoreProvider value={bundleStore(store)}>
          <Toast bottom={0} />
        </StoreProvider>,
      );
      await act(async () => store.getState().showToast('COMPLETED', true));
      expect(screen.getByText('COMPLETED')).toBeTruthy();
      await act(async () => store.getState().dismissToast(store.getState().toast!.key));
      // Leaving: still drawn for its fade, but UNDO can't be hit any more.
      expect(screen.getByText('COMPLETED')).toBeTruthy();
      expect(screen.getByLabelText('Undo')).toBeTruthy();
      expect(screen.getByTestId('toast').props.pointerEvents).toBe('none');
      await act(async () => jest.advanceTimersByTime(duration.base));
      expect(screen.queryByText('COMPLETED')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
