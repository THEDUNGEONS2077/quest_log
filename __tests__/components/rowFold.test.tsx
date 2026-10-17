/**
 * __tests__/components/rowFold.test.tsx: a row's part in a fold
 * (components/list/rowCollapse.ts useRowFold, 2026-10-17): it folds away
 * while a task above it closes, fades in when it appears as one opens, and
 * goes back from where it is when a fold turns around.
 */
import { renderHook } from '@testing-library/react-native';

import { useRowFold } from '@/components/list/rowCollapse';

/** Renders the hook with stand-in controls, returning them and a rerender. */
async function setup(initial: { id: string; away: boolean; opening: boolean }) {
  const fold = { foldAway: jest.fn(), foldBack: jest.fn(), appear: jest.fn() };
  const view = await renderHook((p: typeof initial) => useRowFold(p.id, p.away, p.opening, fold), { initialProps: initial });
  return { fold, rerender: view.rerender };
}

it('fades in a row that appears as its task opens', async () => {
  const { fold } = await setup({ id: 'a', away: false, opening: true });
  expect(fold.appear).toHaveBeenCalledTimes(1);
});

it("folds a row away while a task above it closes, and brings it back if the fold turns around (it doesn't reappear)", async () => {
  const { fold, rerender } = await setup({ id: 'a', away: false, opening: false });
  await rerender({ id: 'a', away: true, opening: false });
  expect(fold.foldAway).toHaveBeenCalledTimes(1);
  await rerender({ id: 'a', away: false, opening: true });
  expect(fold.appear).not.toHaveBeenCalled();
  expect(fold.foldBack).toHaveBeenCalledTimes(2); // at first (nothing to undo), and turning around
});

it('a row reused for another task that appears with its opening task fades in too', async () => {
  const { fold, rerender } = await setup({ id: 'a', away: false, opening: false });
  await rerender({ id: 'b', away: false, opening: true });
  expect(fold.appear).toHaveBeenCalledTimes(1);
});
