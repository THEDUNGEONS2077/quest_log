/**
 * __tests__/components/CompleteBurst.test.tsx: the completion burst plays
 * only for a real check (components/list/CompleteBurst.tsx).
 */
import { renderHook } from '@testing-library/react-native';

import { useJustChecked } from '@/components/list/CompleteBurst';

describe('useJustChecked', () => {
  it('counts each check of the same task, not unchecks', async () => {
    const { result, rerender } = await renderHook(({ id, done }: { id: string; done: boolean }) => useJustChecked(id, done), {
      initialProps: { id: 'a', done: false },
    });
    expect(result.current).toBe(0);
    await rerender({ id: 'a', done: true });
    expect(result.current).toBe(1);
    await rerender({ id: 'a', done: false });
    expect(result.current).toBe(1);
    await rerender({ id: 'a', done: true });
    expect(result.current).toBe(2);
  });

  it('stays still for a row that mounts done, or is reused for a done task', async () => {
    const { result, rerender } = await renderHook(({ id, done }: { id: string; done: boolean }) => useJustChecked(id, done), {
      initialProps: { id: 'a', done: true },
    });
    expect(result.current).toBe(0);
    await rerender({ id: 'b', done: false });
    await rerender({ id: 'c', done: true }); // the list recycled the row onto another task
    expect(result.current).toBe(0);
  });
});
