/**
 * __tests__/components/keyboard.test.tsx: sheets wait for the keyboard to
 * close before they appear (the stuck "> new quest" bar, 2026-10-09).
 */
import { act, renderHook } from '@testing-library/react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useAfterKeyboardCloses } from '@/components/common/keyboard';

const controller = KeyboardController as unknown as { isVisible: jest.Mock; dismiss: jest.Mock };

afterEach(() => {
  controller.isVisible.mockReturnValue(false);
  controller.dismiss.mockReset().mockReturnValue(Promise.resolve());
  jest.useRealTimers();
});

describe('useAfterKeyboardCloses', () => {
  it('shows at once when the keyboard is already closed', async () => {
    const { result } = await renderHook(() => useAfterKeyboardCloses(true));
    expect(result.current).toBe(true);
    expect(controller.dismiss).not.toHaveBeenCalled();
  });

  it('closes an open keyboard first and shows once it has closed', async () => {
    controller.isVisible.mockReturnValue(true);
    let closed: () => void = () => {};
    controller.dismiss.mockReturnValue(new Promise<void>((resolve) => (closed = resolve)));
    const { result } = await renderHook(() => useAfterKeyboardCloses(true));
    expect(result.current).toBe(false);
    expect(controller.dismiss).toHaveBeenCalledTimes(1);
    await act(async () => closed());
    expect(result.current).toBe(true);
  });

  it('shows anyway if the keyboard never reports closing', async () => {
    jest.useFakeTimers();
    controller.isVisible.mockReturnValue(true);
    controller.dismiss.mockReturnValue(new Promise<void>(() => {}));
    const { result } = await renderHook(() => useAfterKeyboardCloses(true));
    expect(result.current).toBe(false);
    await act(async () => jest.advanceTimersByTime(450));
    expect(result.current).toBe(true);
  });

  it('stays hidden while not asked to show', async () => {
    const { result } = await renderHook(() => useAfterKeyboardCloses(false));
    expect(result.current).toBe(false);
  });
});
