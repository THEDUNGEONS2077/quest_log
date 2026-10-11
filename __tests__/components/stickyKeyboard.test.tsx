/**
 * __tests__/components/stickyKeyboard.test.tsx: the quick-add bar never
 * stays lifted over a keyboard that isn't there (components/common/
 * keyboard.tsx KeyboardStickyView; the stuck "> new quest" bar, bugs
 * 2026-10-09 and 2026-10-10).
 */
import { act, render, screen } from '@testing-library/react-native';
import { AppState, Keyboard, Text } from 'react-native';
import { KeyboardEvents, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { getAnimatedStyle } from 'react-native-reanimated';

import { ensureKeyboard, KeyboardStickyView } from '@/components/common/keyboard';

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

it('never stays up for a field that has lost focus, whatever the trackers say (bug 2026-10-11)', async () => {
  libraryKeyboard(1, -300); // the library: "open"
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true); // React Native: stale "open" too
  captureListeners();
  const ui = await render(
    <KeyboardStickyView testID="bar" riding>
      <Text>new quest</Text>
    </KeyboardStickyView>,
  );
  expect(translateY()).toBe(-300);
  // The field lets go (the keyboard closed, or back): the bar must come down.
  await ui.rerender(
    <KeyboardStickyView testID="bar" riding={false}>
      <Text>new quest</Text>
    </KeyboardStickyView>,
  );
  await act(async () => jest.advanceTimersByTime(500 + 80 + 400));
  expect(translateY()).toBe(0);
});

it('checks itself while up even when nothing reports anything', async () => {
  libraryKeyboard(1, -300);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  captureListeners(); // no event will ever fire
  await render(
    <KeyboardStickyView testID="bar">
      <Text>new quest</Text>
    </KeyboardStickyView>,
  );
  await act(async () => jest.advanceTimersByTime(1500 + 80 + 400));
  expect(translateY()).toBe(0);
});

it('a quick-add bar coming back without focus starts down, then follows a real keyboard', async () => {
  libraryKeyboard(1, -300); // stale: "open"
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  captureListeners();
  const library: Record<string, () => void> = {};
  (KeyboardEvents.addListener as jest.Mock).mockImplementation((name: string, fn: () => void) => {
    library[name] = fn;
    return { remove: jest.fn() };
  });
  await render(
    <KeyboardStickyView testID="bar" riding={false}>
      <Text>new quest</Text>
    </KeyboardStickyView>,
  );
  expect(translateY()).toBe(0); // never lifted by a stale library
  await act(async () => library.keyboardWillShow?.()); // a real keyboard opening
  await act(async () => jest.advanceTimersByTime(20)); // a frame, for the style to update
  expect(translateY()).toBe(-300);
});

describe('ensureKeyboard (the keyboard opens with an editor, bug 2026-10-11)', () => {
  const field = (focused: boolean) => ({ isFocused: () => focused, blur: jest.fn(), focus: jest.fn() });

  it('asks again when the field has focus but no keyboard came', () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    const input = field(true);
    ensureKeyboard({ current: input as never });
    jest.advanceTimersByTime(250);
    expect(input.blur).toHaveBeenCalledTimes(1);
    expect(input.focus).toHaveBeenCalledTimes(1);
  });

  it('leaves it alone when the keyboard is up', () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    const open = field(true);
    ensureKeyboard({ current: open as never });
    jest.advanceTimersByTime(1000);
    expect(open.focus).not.toHaveBeenCalled();
  });

  it('leaves it alone when the field let go, or the check was cancelled', () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    const gone = field(false);
    ensureKeyboard({ current: gone as never });
    const cancelled = field(true);
    ensureKeyboard({ current: cancelled as never })();
    jest.advanceTimersByTime(1000);
    for (const f of [gone, cancelled]) expect(f.focus).not.toHaveBeenCalled();
  });
});
