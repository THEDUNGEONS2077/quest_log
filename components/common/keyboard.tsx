/**
 * components/common/keyboard.tsx: keyboard-aware building blocks, native
 * version (the web version is keyboard.web.tsx).
 *
 * Layer: UI. Native apps use react-native-keyboard-controller, which tracks
 * the keyboard frame by frame. Components import from here, never from the
 * library, so the web build can swap in its own versions.
 *
 * The "> new quest" bar stuck mid-screen (bugs 2026-10-09, 2026-10-10): the
 * library follows the keyboard through its animations and can't recover
 * when it misses one, so it reports a keyboard that isn't there. Three
 * protections, from cause to cure:
 *   1. useAfterKeyboardCloses: sheets open only after the keyboard closed;
 *   2. closeKeyboardThen: a sheet with its own text field closes only after
 *      its keyboard closed;
 *   3. KeyboardStickyView checks itself against the system and slides back
 *      down whenever the two disagree (any cause, including ones not known).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, type ViewProps } from 'react-native';
import { KeyboardController, KeyboardEvents, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing } from '@/theme';

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

/**
 * Runs `then` once the keyboard is closed: at once if it already is,
 * otherwise after closing it (or KEYBOARD_CLOSE_TIMEOUT_MS at most).
 *
 * For closing a Modal that has its own text field (Move to…'s search).
 * When a Modal closes, the library copies the keyboard state it saw inside
 * the Modal back to the main screen; closed while its keyboard is still up,
 * that's "keyboard open" with no closing animation ever to follow on the
 * main screen, which lifts the quick-add bar mid-screen (bug 2026-10-10).
 */
export function closeKeyboardThen(then: () => void): void {
  if (!KeyboardController.isVisible()) {
    then();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    then();
  };
  void KeyboardController.dismiss().then(finish);
  setTimeout(finish, KEYBOARD_CLOSE_TIMEOUT_MS);
}

/** How long the keyboard position must be still before it's checked against the system. */
const SETTLE_MS = 500;
/** Lifted at least this much (0–1) counts as "the bar is up". */
const LIFTED = 0.05;

type StickyProps = ViewProps & {
  /** translateY added when the keyboard is closed / open (the library's offsets). */
  offset?: { closed?: number; opened?: number };
};

/**
 * Content that rides just above the on-screen keyboard (the quick-add bar,
 * the editing toolbar). It follows the library's frame-by-frame keyboard
 * position, and corrects itself when that position is wrong.
 *
 * Why: the library tracks the keyboard by its animations, and has no way
 * back if it misses one. It then reports a keyboard that isn't there and
 * the bar hangs mid-screen until a real keyboard opens (bugs 2026-10-09 and
 * 2026-10-10). Known causes: the keyboard closing while a Modal shows, a
 * Modal closing with its own keyboard up, the app being left with the
 * keyboard open (it closes in the background, where no animation runs), and
 * a keyboard animation that never finishes.
 *
 * So after the position has been still for SETTLE_MS, whenever the app
 * comes back to the foreground, and whenever React Native reports the
 * keyboard closed, the bar checks the position against React Native's own
 * keyboard state, which reads the window directly (the editing toolbar
 * already relies on it). Lifted with no keyboard there, the bar slides back
 * down (`trust` → 0) and stays down until a real keyboard opens.
 */
export function KeyboardStickyView({ offset, style, children, ...rest }: StickyProps) {
  const closed = offset?.closed ?? 0;
  const opened = offset?.opened ?? 0;
  const { height, progress } = useReanimatedKeyboardAnimation();
  // 1 = follow the library; 0 = stay at the bottom (the library is wrong).
  const trust = useSharedValue(1);

  const check = useCallback(() => {
    const lifted = progress.get() > LIFTED;
    if (!lifted)
      trust.set(1); // in agreement again (and harmless at the bottom)
    else if (!Keyboard.isVisible()) trust.set(withTiming(0, { duration: duration.base, easing }));
  }, [progress, trust]);

  // Debounced: every movement restarts the wait, so the check runs once things settle.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const checkSoon = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(check, SETTLE_MS);
  }, [check]);

  useAnimatedReaction(
    () => progress.get(),
    (now, before) => {
      if (now !== before) scheduleOnRN(checkSoon);
    },
  );

  useEffect(() => {
    const believe = () => trust.set(1);
    const subs = [
      // A real keyboard opening: follow it again (and check, in case it's a phantom).
      KeyboardEvents.addListener('keyboardWillShow', () => {
        believe();
        checkSoon();
      }),
      Keyboard.addListener('keyboardDidShow', believe),
      Keyboard.addListener('keyboardDidHide', checkSoon),
      AppState.addEventListener('change', (state) => state === 'active' && checkSoon()),
    ];
    return () => {
      clearTimeout(timer.current);
      subs.forEach((sub) => sub.remove());
    };
  }, [trust, checkSoon]);

  const stick = useAnimatedStyle(() => {
    const t = trust.get();
    const follow = height.get() + interpolate(progress.get(), [0, 1], [closed, opened]);
    return { transform: [{ translateY: t * follow + (1 - t) * closed }] };
  });

  return (
    <Animated.View style={[style, stick]} {...rest}>
      {children}
    </Animated.View>
  );
}
