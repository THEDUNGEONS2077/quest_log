/**
 * components/common/BlockCursor.tsx: the blinking block cursor `█`
 * (PLAN §10.2).
 *
 * Layer: UI. Used in the boot sequence, the empty state and the idle
 * quick-add bar. (Text fields keep the native caret, themed green.)
 *
 * Every cursor on screen shares ONE Reanimated value, so they blink in
 * step and the app runs a single animation however many are shown. The
 * animation starts with the first mounted cursor and stops with the last.
 * With Reduce Motion the cursor stays on.
 *
 * Render it inside a <Text> (it's a nested text span): the blink animates
 * its color between the given color and transparent, because opacity
 * doesn't apply to nested text.
 */
import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  interpolateColor,
  makeMutable,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, glyphs, timing } from '@/theme';

import { useReduceMotion } from './motion';

/** 1 = visible, 0 = hidden. Shared by every cursor. */
const blink = makeMutable(1);
/** How many blinking cursors are mounted (the animation runs while > 0). */
let users = 0;

/** Registers one blinking cursor; starts the shared blink for the first. */
function startBlink(): () => void {
  if (users++ === 0) {
    blink.set(1);
    // On for 530 ms, off for 530 ms, forever (instant switches, like a terminal).
    blink.set(
      withRepeat(
        withSequence(
          withDelay(timing.cursorBlink, withTiming(0, { duration: 0 })),
          withDelay(timing.cursorBlink, withTiming(1, { duration: 0 })),
        ),
        -1,
      ),
    );
  }
  return () => {
    if (--users === 0) {
      cancelAnimation(blink);
      blink.set(1);
    }
  };
}

/** A blinking `█`, nested in a <Text>. Defaults to the accent color. */
export function BlockCursor({ color = colors.accent }: { color?: string }) {
  const reduce = useReduceMotion();
  useEffect(() => (reduce ? undefined : startBlink()), [reduce]);
  const style = useAnimatedStyle(() => ({
    color: reduce ? color : interpolateColor(blink.get(), [0, 1], ['transparent', color]),
  }));
  return (
    // Decorative: screen readers skip it.
    <Animated.Text style={style} accessibilityElementsHidden importantForAccessibility="no">
      {glyphs.cursor.glyph}
    </Animated.Text>
  );
}
