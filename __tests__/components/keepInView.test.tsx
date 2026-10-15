/**
 * __tests__/components/keepInView.test.tsx: keeping the typed text in view
 * scrolls the list by the hidden amount, and not at all for less than a
 * point, which is rounding (bug 2026-10-15: the list twitched on each check
 * while a long quest title was typed).
 */
import { act, renderHook } from '@testing-library/react-native';
import type { View } from 'react-native';

import { registerFloor, useKeepInViewController } from '@/components/list/keepInView';

// The focused text box, as keepInView measures it (window coordinates).
let mockInputBox = { top: 0, height: 0 };
jest.mock('@/components/list/focusedInput', () => ({
  focusedInput: () => ({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, mockInputBox.top, 300, mockInputBox.height) }),
}));

/** A view stand-in that measures at `top`, `height` tall. */
const box = (top: number, height: number) =>
  ({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, top, 300, height) }) as unknown as View;

describe('keeping the text in view', () => {
  afterEach(() => {
    jest.useRealTimers();
    registerFloor(null);
  });

  async function check(inputBottomOverToolbar: number) {
    // The toolbar's top edge at 500; the list from 0; MARGIN (space.md, 12) is kept above the toolbar.
    registerFloor(box(500, 50));
    mockInputBox = { top: 400, height: 500 - 12 - 400 + inputBottomOverToolbar };
    const scrollToOffset = jest.fn();
    const list = { current: { getAbsoluteLastScrollOffset: () => 100, scrollToOffset } };
    const container = { current: box(0, 800) };
    const { result } = await renderHook(() => useKeepInViewController(container, list));
    jest.useFakeTimers(); // after rendering: the frame and settle timers below are faked
    await act(async () => {
      result.current.ensure();
      jest.advanceTimersByTime(20); // the next frame's pass
      await Promise.resolve();
    });
    return scrollToOffset;
  }

  it('does not scroll for an overlap under a point (rounding)', async () => {
    expect(await check(0.5)).not.toHaveBeenCalled();
  });

  it('scrolls by the overlap when a line is really hidden', async () => {
    expect(await check(20)).toHaveBeenCalledWith({ offset: 120, animated: false });
  });
});
