/**
 * __tests__/components/stickyKeyboard.test.tsx: the quick-add bar never
 * stays lifted over a keyboard that isn't there (components/common/
 * keyboard.tsx KeyboardStickyView; the stuck "> new quest" bar, bugs
 * 2026-10-09 and 2026-10-10).
 */
import { act, render, screen } from '@testing-library/react-native';
import { AppState, Keyboard, Text } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { getAnimatedStyle } from 'react-native-reanimated';

import { KeyboardStickyView } from '@/components/common/keyboard';

/** The library's mocked keyboard: lifted by `height` (negative is up), `progress` 0–1. */
function libraryKeyboard(progress: number, height: number) {
  (useReanimatedKeyboardAnimation as jest.Mock).mockReturnValue({
    progress: { value: progress, get: () => progress, set: jest.fn() },
    height: { value: height, get: () => height, set: jest.fn() },
  });
}

/** Captures the React Native keyboard and app-state listeners the view registers. */
function captureListeners() {
  const keyboard: Record<string, () => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: () => void) => {
    keyboard[name] = fn;
    return { remove: jest.fn() };
  }) as never);
  let appState: ((s: string) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    appState = fn;
    return { remove: jest.fn() };
  }) as never);
  return { keyboard, appState: (s: string) => appState?.(s) };
}

const translateY = () => {
  const style = getAnimatedStyle(screen.getByTestId('bar')) as { transform?: { translateY: number }[] };
  return style.transform?.[0]?.translateY;
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('slides back down when the library reports a keyboard the system says is closed', async () => {
  libraryKeyboard(1, -300); // stuck: "open, 300 pt"
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  const { appState } = captureListeners();
  await render(
    <KeyboardStickyView testID="bar">
      <Text>new quest</Text>
    </KeyboardStickyView>,
  );
  expect(translateY()).toBe(-300);
  // The app comes back (the keyboard closed while it was in the background).
  await act(async () => appState('active'));
  await act(async () => jest.advanceTimersByTime(500 + 400));
  expect(translateY()).toBe(0);
});

it('stays with a real keyboard', async () => {
  libraryKeyboard(1, -300);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
  const { keyboard } = captureListeners();
  await render(
    <KeyboardStickyView testID="bar">
      <Text>new quest</Text>
    </KeyboardStickyView>,
  );
  await act(async () => keyboard.keyboardDidHide?.());
  await act(async () => jest.advanceTimersByTime(500 + 400));
  expect(translateY()).toBe(-300);
});
