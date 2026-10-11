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
 *   3. KeyboardStickyView checks itself (focus, and a freshly re-read
 *      system keyboard state) and slides back down whenever it's wrong,
 *      whatever the cause, including ones not known.
 * Every keyboard report and correction goes to a small in-memory log that
 * the developer screen shows (keyboardLog.ts).
 */
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Keyboard, StyleSheet, type TextInput, View, type ViewProps } from 'react-native';
import { KeyboardController, KeyboardEvents, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing } from '@/theme';

import { logKeyboard } from './keyboardLog';

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
    logKeyboard('sheet: closing the keyboard first');
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
  logKeyboard('closing the keyboard before closing a sheet');
  void KeyboardController.dismiss().then(finish);
  setTimeout(finish, KEYBOARD_CLOSE_TIMEOUT_MS);
}

/** How long the keyboard position must be still before it's checked. */
const SETTLE_MS = 500;
/** While the bar is up, it's checked this often anyway (a missed trigger can't leave it up). */
const CHECK_EVERY_MS = 1500;
/** After forcing a re-layout, how long React Native gets to re-read the keyboard state. */
const RELAYOUT_WAIT_MS = 80;
/** Lifted at least this much (0–1) counts as "the bar is up". */
const LIFTED = 0.05;

let logStarted = false;
/** Records every keyboard report in the developer log (keyboardLog.ts); once per app run. */
function startKeyboardLog(): void {
  if (logStarted) return;
  logStarted = true;
  for (const name of ['keyboardWillShow', 'keyboardDidShow', 'keyboardWillHide', 'keyboardDidHide'] as const) {
    KeyboardEvents.addListener(name, (e) => logKeyboard(`library ${name} ${Math.round(e.height)}`));
  }
  Keyboard.addListener('keyboardDidShow', (e) => logKeyboard(`system keyboardDidShow ${Math.round(e.endCoordinates.height)}`));
  Keyboard.addListener('keyboardDidHide', () => logKeyboard('system keyboardDidHide'));
  AppState.addEventListener('change', (state) => logKeyboard(`app ${state}`));
}

/**
 * Calls `then` when either keyboard tracker reports the keyboard closed (the
 * library's or React Native's: each can miss what the other sees). Returns
 * the unsubscribe function.
 */
export function onKeyboardHidden(then: () => void): () => void {
  const subs = [KeyboardEvents.addListener('keyboardDidHide', then), Keyboard.addListener('keyboardDidHide', then)];
  return () => subs.forEach((sub) => sub.remove());
}

type StickyProps = ViewProps & {
  /** translateY added when the keyboard is closed / open (the library's offsets). */
  offset?: { closed?: number; opened?: number };
  /**
   * Whether this content belongs on the keyboard right now: the quick-add bar
   * only while its field has focus (default: always, e.g. the editing
   * toolbar, which only exists while a task is being edited).
   */
  riding?: boolean;
};

/**
 * Content that rides just above the on-screen keyboard (the quick-add bar,
 * the editing toolbar). It follows the library's frame-by-frame keyboard
 * position, and corrects itself when that position is wrong.
 *
 * Why: the library tracks the keyboard by its animations and can't recover
 * when it misses one: it reports a keyboard that isn't there, and the bar
 * hangs mid-screen (bugs 2026-10-09, -10, -11). React Native's own keyboard
 * state is no help on its own: it's only re-read when the screen lays
 * itself out again, and the keyboard closing changes no layout here (the
 * bar moves by transform), so it can be stale too.
 *
 * So the bar checks itself, and never relies on one tracker:
 *   - it may only be up while `riding` (the quick-add field has focus): up
 *     without it is wrong whatever the trackers say;
 *   - before each check it forces a tiny invisible re-layout (`relayout`),
 *     which makes React Native re-read the real keyboard state, and then
 *     asks it;
 *   - checks run when the position has been still for SETTLE_MS, when
 *     `riding` turns off, when the app returns to the foreground, when
 *     either tracker reports the keyboard closed, and every CHECK_EVERY_MS
 *     while the bar is up.
 * Wrong, it slides back down (`trust` → 0) until a real keyboard opens.
 * Every report and correction goes to the developer log (keyboardLog.ts).
 */
export function KeyboardStickyView({ offset, riding = true, style, children, ...rest }: StickyProps) {
  const closed = offset?.closed ?? 0;
  const opened = offset?.opened ?? 0;
  const { height, progress } = useReanimatedKeyboardAnimation();
  // 1 = follow the library; 0 = stay at the bottom (the library is wrong). A bar that
  // mounts while not riding (quick-add coming back after editing) starts at the bottom:
  // if the library is stale then, it must not start lifted. A real keyboard event
  // (below) makes it follow.
  const trust = useSharedValue(riding ? 1 : 0);
  // Toggled to force a re-layout, so React Native re-reads the keyboard state.
  const [relayout, setRelayout] = useState(false);
  // `riding` as of the last render, for checks that run later (timers, events).
  const ridingNow = useRef(riding);
  useLayoutEffect(() => {
    ridingNow.current = riding;
  }, [riding]);

  useEffect(startKeyboardLog, []);

  /** Decides, from the trackers as they are now. */
  const decide = useCallback(() => {
    const lift = progress.get();
    if (lift <= LIFTED) {
      if (trust.get() < 1) trust.set(1); // in agreement again (and harmless at the bottom)
      return;
    }
    const reason = !ridingNow.current ? 'not typing' : !Keyboard.isVisible() ? 'no keyboard' : null;
    if (reason && trust.get() > 0) {
      logKeyboard(`bar down: up ${lift.toFixed(2)} with ${reason}`);
      trust.set(withTiming(0, { duration: duration.base, easing }));
    }
  }, [progress, trust]);

  /** A check: force a re-layout first, then decide once React Native has looked. */
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const verify = useCallback(() => {
    clearTimeout(timer.current);
    setRelayout((r) => !r);
    timer.current = setTimeout(decide, RELAYOUT_WAIT_MS);
  }, [decide]);

  // Debounced: every movement restarts the wait, so the check runs once things settle.
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const checkSoon = useCallback(() => {
    clearTimeout(settle.current);
    settle.current = setTimeout(verify, SETTLE_MS);
  }, [verify]);

  useAnimatedReaction(
    () => progress.get(),
    (now, before) => {
      if (now !== before) scheduleOnRN(checkSoon);
    },
  );

  // Typing ended: the bar must come down (normally with the keyboard; a check makes sure).
  // Typing started with a keyboard already up: follow it now (no "will show" will come).
  useEffect(() => {
    if (!riding) checkSoon();
    else if (Keyboard.isVisible()) trust.set(1);
  }, [riding, checkSoon, trust]);

  useEffect(() => {
    const believe = (why: string) => {
      if (trust.get() < 1) logKeyboard(`bar follows: ${why}`);
      trust.set(1);
    };
    const subs = [
      // A real keyboard opening: follow it again (and check, in case it's a phantom).
      KeyboardEvents.addListener('keyboardWillShow', () => {
        believe('library keyboardWillShow');
        checkSoon();
      }),
      Keyboard.addListener('keyboardDidShow', () => believe('system keyboardDidShow')),
      AppState.addEventListener('change', (state) => state === 'active' && checkSoon()),
    ];
    const unhide = onKeyboardHidden(checkSoon);
    // The safety net: while the bar is up, check now and then whatever else happened.
    const every = setInterval(() => progress.get() > LIFTED && verify(), CHECK_EVERY_MS);
    return () => {
      clearTimeout(settle.current);
      clearTimeout(timer.current);
      clearInterval(every);
      unhide();
      subs.forEach((sub) => sub.remove());
    };
  }, [trust, progress, checkSoon, verify]);

  const stick = useAnimatedStyle(() => {
    const t = trust.get();
    const follow = height.get() + interpolate(progress.get(), [0, 1], [closed, opened]);
    return { transform: [{ translateY: t * follow + (1 - t) * closed }] };
  });

  return (
    <Animated.View style={[style, stick]} {...rest}>
      {children}
      {/* Invisible: its size flips to force a re-layout (see `verify`). */}
      <View pointerEvents="none" style={[styles.relayout, relayout && styles.relayoutOn]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  relayout: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  relayoutOn: { height: 1 },
});

/** When the keyboard should have opened, the first check (then a second, later one). */
const KEYBOARD_CHECKS_MS = [250, 700] as const;

/**
 * Makes sure the keyboard opened for `input`, a field that just took focus
 * by itself (an editor opening, quick-add asked to focus). Returns a cancel
 * function, for an effect's cleanup.
 *
 * Why (bug 2026-10-11, "when adding a subtask, the keyboard is not
 * opening"): Android only opens the keyboard for a field that is on screen,
 * in a window that has focus. A field focused the moment it mounts can be
 * neither yet (a brand-new list row; a sheet still closing, e.g. the hold
 * menu's "Add subtask"), and then it gets focus without a keyboard. Fields
 * now focus with `autoFocus`, which Android applies once the field is on
 * screen; this is the follow-up: if the field has focus but no keyboard
 * came, it asks again. (A plain focus() is ignored for a field React Native
 * already counts as focused, so it lets go first.)
 */
export function ensureKeyboard(input: RefObject<TextInput | null>): () => void {
  const timers = KEYBOARD_CHECKS_MS.map((ms) =>
    setTimeout(() => {
      const field = input.current;
      if (!field?.isFocused() || Keyboard.isVisible()) return;
      logKeyboard(`no keyboard ${ms} ms after focus: asking again`);
      field.blur();
      field.focus();
    }, ms),
  );
  return () => timers.forEach(clearTimeout);
}
