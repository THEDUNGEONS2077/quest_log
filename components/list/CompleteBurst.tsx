/**
 * components/list/CompleteBurst.tsx: the moment a task is checked (user
 * request 2026-10-09: "improve the animation for when a task is completed").
 *
 *   [✓] ░░░░░░░░░░░░░▌ Buy milk            +18 XP ↑
 *    │        │                              │
 *   pop     scan (behind the row)         XP float
 *
 * Layer: UI. Three small pieces, all UI-thread animations that start
 * together with the strikethrough (StrikeText):
 *   - CheckGlyph: the [x] pops (scale.pop, fast up and base back) and
 *     flashes accent before settling to the dim "done" color, both over slow;
 *   - CompleteScan: a faint accent wash sweeps across the row behind its
 *     content (slow), led by a bright 2 pt line, then fades (slow): a
 *     terminal scan line;
 *   - XpFloat: "+N XP", the XP the check earned (store `lastGain`), rises
 *     from the row's right edge and fades, with the same motion as the XP
 *     bar's "+N" (useFloatUp), so the reward is seen where it happened.
 * All numbers are theme/motion.ts tokens.
 * A top-level task then slides out of ACTIVE (TaskRow).
 *
 * Only a real check plays it: a row that mounts already done (scrolling,
 * relaunch) or is recycled by the list onto another task stays still
 * (useJustChecked). With Reduce Motion, Reanimated ends every animation at
 * once: the check simply shows, the scan and float stay invisible.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { useFloatUp } from '@/components/common/motion';
import {
  colors,
  distance,
  duration,
  easing,
  fonts,
  glowShadow,
  glowText,
  maxFontSizeMultiplier,
  platformText,
  scale,
  shape,
  space,
  type,
} from '@/theme';

/** The wash's strength at its brightest: a hint of green, the text stays readable. */
const SCAN_WASH = 0.14;

/**
 * Counts the times task `id` went from not done to done while this row
 * showed it: 0 at first, +1 on each check. A change of `id` (the list reusing
 * the row for another task) resets the baseline without counting.
 */
export function useJustChecked(id: string, done: boolean): number {
  const [seen, setSeen] = useState({ id, done, count: 0 });
  // Compared during render (React's "previous props" pattern), so the pieces
  // start on the same frame as the strike.
  if (seen.id !== id || seen.done !== done) {
    const count = seen.count + (seen.id === id && !seen.done && done ? 1 : 0);
    setSeen({ id, done, count });
    return count;
  }
  return seen.count;
}

/** The checkbox glyph: pops and flashes accent on each check (`fire` going up). */
export function CheckGlyph({ fire, done, glyph, style }: { fire: number; done: boolean; glyph: string; style: TextStyle[] }) {
  const flash = useSharedValue(0);
  const swell = useSharedValue(1);
  useEffect(() => {
    if (fire === 0) return;
    // Accent at once, easing back to the resting color while the glyph swells (fast)
    // and settles (base): both end together, at fast + base = slow.
    flash.set(1);
    flash.set(withTiming(0, { duration: duration.slow, easing }));
    swell.set(withSequence(withTiming(scale.pop, { duration: duration.fast, easing }), withTiming(1, { duration: duration.base, easing })));
  }, [fire, flash, swell]);
  const rest = done ? colors.textDim : colors.text;
  const animated = useAnimatedStyle(() => ({
    color: interpolateColor(flash.get(), [0, 1], [rest, colors.accent]),
    transform: [{ scale: swell.get() }],
  }));
  return (
    <Animated.Text style={[...style, animated]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {glyph}
    </Animated.Text>
  );
}

/** The scan line across the row; render it before the row's content so it stays behind. */
export function CompleteScan({ fire }: { fire: number }) {
  const sweep = useSharedValue(0);
  const shown = useSharedValue(0);
  useEffect(() => {
    if (fire === 0) return;
    // Crosses the row, then fades: slow each.
    sweep.set(0);
    sweep.set(withTiming(1, { duration: duration.slow, easing }));
    shown.set(1);
    shown.set(withDelay(duration.slow, withTiming(0, { duration: duration.slow, easing })));
  }, [fire, sweep, shown]);
  const wash = useAnimatedStyle(() => ({ width: `${sweep.get() * 100}%`, opacity: shown.get() * SCAN_WASH }));
  const head = useAnimatedStyle(() => ({ left: `${sweep.get() * 100}%`, opacity: shown.get() }));
  if (fire === 0) return null;
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.wash, wash]} />
      <Animated.View pointerEvents="none" style={[styles.head, head]} />
    </>
  );
}

/**
 * "+N XP" rising from the row's right edge; render it after the row's
 * content so it's on top. `inset` moves it left of controls at that edge
 * (a quest's "+" button).
 */
export function XpFloat({ fire, xp, inset = 0 }: { fire: number; xp: number; inset?: number }) {
  // The same rhythm as the XP bar's "+N" (useFloatUp); replays for each check, and
  // again if the amount arrives a render after the check.
  const style = useFloatUp(fire > 0 && xp > 0 ? `${fire}:${xp}` : '', distance.float);
  if (fire === 0 || xp <= 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.float, { right: space.lg + inset }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[type.meta, styles.floatText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`+${xp} XP`}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wash: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.accent },
  // The scan's leading edge: a bright line, glowing like the XP bar's fill.
  head: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: shape.dropIndicator,
    marginLeft: -shape.dropIndicator,
    backgroundColor: colors.accent,
    boxShadow: glowShadow.bright,
  },
  float: { position: 'absolute', top: space.sm },
  floatText: {
    color: colors.accent,
    fontFamily: fonts.bold,
    ...glowText,
    ...platformText,
  },
});
