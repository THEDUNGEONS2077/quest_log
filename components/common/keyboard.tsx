/**
 * components/common/keyboard.tsx: keyboard-aware building blocks, native
 * version (the web version is keyboard.web.tsx).
 *
 * Layer: UI. Native apps use react-native-keyboard-controller, which tracks
 * the keyboard frame by frame. Components import from here, never from the
 * library, so the web build can swap in its own versions.
 */
import { type ComponentProps, useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { KeyboardController, KeyboardEvents, KeyboardStickyView as LibraryStickyView } from 'react-native-keyboard-controller';

export { KeyboardProvider } from 'react-native-keyboard-controller';

/** Longest wait for the keyboard to close before a sheet opens anyway. */
const KEYBOARD_CLOSE_TIMEOUT_MS = 450;

/**
 * Sheets open only once the keyboard is closed. Returns `visible`, delayed
 * while an open keyboard is dismissed first. Use it on a component mounted
 * fresh for each opening (its state starts from the keyboard as it is then).
 *
 * Why (bug 2026-10-09, "the > new quest bar gets stuck in the middle of
 * the screen"): while a Modal is showing, react-native-keyboard-controller
 * pauses its main-window tracker (ModalAttachedWatcher). If the keyboard
 * closes during that time, the tracker misses it and keeps believing the
 * keyboard is open. Later, when focus moves to a text field (the row editor
 * closing hands focus to the quick-add input), its focus listener reports
 * "keyboard open, full height" from that stale state, with no keyboard
 * animation to correct it, and the sticky quick-add bar floats mid-screen.
 * Closing the keyboard *before* the Modal appears keeps the tracker's state
 * true.
 */
export function useAfterKeyboardCloses(visible: boolean): boolean {
  const [clear, setClear] = useState(() => !KeyboardController.isVisible());
  useEffect(() => {
    if (!visible || clear) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setClear(true);
    };
    void KeyboardController.dismiss().then(finish);
    // Never wait forever: if the "closed" event doesn't come, open anyway.
    const timer = setTimeout(finish, KEYBOARD_CLOSE_TIMEOUT_MS);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [visible, clear]);
  return visible && clear;
}

/** How long after the library reports "keyboard shown" the system must agree. */
const PHANTOM_CHECK_MS = 700;

/**
 * True while the library reports a keyboard the system doesn't see.
 *
 * Second line of defence for the same bug as useAfterKeyboardCloses: if the
 * library's tracker is ever left believing the keyboard is open, its
 * "shown" report has no keyboard behind it. React Native's own keyboard
 * events read the window directly (the editing toolbar already relies on
 * them), so a "shown" the system still doesn't confirm 700 ms later is a
 * phantom. Cleared by the next real keyboard opening or closing.
 */
function usePhantomKeyboard(): boolean {
  const [phantom, setPhantom] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const real = () => {
      clearTimeout(timer);
      setPhantom(false);
    };
    const subs = [
      KeyboardEvents.addListener('keyboardDidShow', () => {
        clearTimeout(timer);
        timer = setTimeout(() => setPhantom(!Keyboard.isVisible()), PHANTOM_CHECK_MS);
      }),
      KeyboardEvents.addListener('keyboardWillShow', real),
      KeyboardEvents.addListener('keyboardDidHide', real),
      Keyboard.addListener('keyboardDidShow', real),
    ];
    return () => {
      clearTimeout(timer);
      subs.forEach((sub) => sub.remove());
    };
  }, []);
  return phantom;
}

/**
 * Content that rides just above the on-screen keyboard (the quick-add bar,
 * the editing toolbar): the library's view, but it stays at the bottom while
 * the reported keyboard is a phantom (see usePhantomKeyboard).
 */
export function KeyboardStickyView(props: ComponentProps<typeof LibraryStickyView>) {
  const phantom = usePhantomKeyboard();
  return <LibraryStickyView {...props} enabled={(props.enabled ?? true) && !phantom} />;
}
