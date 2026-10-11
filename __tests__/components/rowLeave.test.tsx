/**
 * __tests__/components/rowLeave.test.tsx: a leaving row's store change
 * always happens, once its space has had time to close
 * (components/list/rowCollapse.ts, animation pass 2026-10-11).
 */
import { renderHook } from '@testing-library/react-native';

import { useRowLeave } from '@/components/list/rowCollapse';
import { duration } from '@/theme';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('runs the store change once the space has closed, after any delay', async () => {
  const { result } = await renderHook(() => useRowLeave('a'));
  const then = jest.fn();
  result.current.leave({ then, delay: 100 });
  jest.advanceTimersByTime(100 + duration.slow - 1);
  expect(then).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(then).toHaveBeenCalledTimes(1);
});

it('still runs it when the row is gone before the animation ends (the list reused it)', async () => {
  const { result, unmount } = await renderHook(() => useRowLeave('a'));
  const then = jest.fn();
  result.current.leave({ then });
  await unmount();
  jest.advanceTimersByTime(duration.slow);
  expect(then).toHaveBeenCalledTimes(1);
});
