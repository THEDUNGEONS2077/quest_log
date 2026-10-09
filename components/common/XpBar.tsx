/**
 * components/common/XpBar.tsx: the XP bar under the tabs (user request
 * 2026-10-09).
 *
 *   [■■■■■■■■■■■■■■■■■■■■□□□□□□□□□□□□]  340/425 XP
 *
 * Layer: UI. A thin segmented meter: a hairline frame, accent fill with the
 * app's one effect (the soft glow), and 10 segments, like a terminal gauge.
 * The level itself is in the header (`<7>_quest_log`).
 *
 * When XP is earned the fill eases forward and a small "+18" floats up and
 * fades. On a level-up the fill runs to the end, then starts again from
 * empty. With Reduce Motion every change is instant (global config).
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { levelInfo } from '@/lib/xp';
import { useAppStore } from '@/store/react';
import { colors, duration, easing, glowShadow, maxFontSizeMultiplier, platformText, shape, space, type } from '@/theme';

/** Segments in the meter (purely visual). */
const SEGMENTS = 10;

export function XpBar() {
  const xp = useAppStore((s) => s.tasks.progress.xp);
  const { level, into, needed, fraction } = levelInfo(xp);

  // The fill: eases to the new fraction; on a level-up it first runs to the end.
  const fill = useSharedValue(fraction);
  const shownLevel = useRef(level);
  useEffect(() => {
    const ease = { duration: duration.slow, easing };
    if (level > shownLevel.current) {
      fill.set(
        withSequence(withTiming(1, { duration: duration.base, easing }), withTiming(0, { duration: 0 }), withTiming(fraction, ease)),
      );
    } else {
      fill.set(withTiming(fraction, ease));
    }
    shownLevel.current = level;
  }, [level, fraction, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, fill.get())) * 100}%` }));

  // "+18": the last gain, as a short-lived label (a new key replays it).
  const [gain, setGain] = useState({ xp, amount: 0, key: 0 });
  if (xp !== gain.xp) setGain({ xp, amount: xp - gain.xp, key: gain.key + 1 });

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Level ${level}: ${into} of ${needed} XP to level ${level + 1}`}
      accessibilityValue={{ min: 0, max: needed, now: into }}
    >
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
        {/* Segment separators over the fill: the terminal-gauge look. */}
        {Array.from({ length: SEGMENTS - 1 }, (_, i) => (
          <View key={i} style={[styles.tick, { left: `${((i + 1) * 100) / SEGMENTS}%` }]} />
        ))}
      </View>
      <View>
        <Text style={[type.meta, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${into}/${needed} XP`}
        </Text>
        {gain.amount > 0 && <GainLabel key={gain.key} amount={gain.amount} />}
      </View>
    </View>
  );
}

/** "+18" that floats up from the XP count and fades (mounted fresh for each gain). */
function GainLabel({ amount }: { amount: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 1200, easing }));
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.get() < 0.15 ? t.get() / 0.15 : 1 - (t.get() - 0.15) / 0.85,
    transform: [{ translateY: -space.md * t.get() }],
  }));
  return (
    <Animated.Text
      style={[type.meta, styles.gain, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {`+${amount}`}
    </Animated.Text>
  );
}

/** Track height: still slim, but solid enough to read at a glance (6 → 10, user request 2026-10-09). */
const TRACK = 10;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: space.lg, marginBottom: space.md, minHeight: 20 },
  track: {
    flex: 1,
    height: TRACK,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent, boxShadow: glowShadow.outset },
  tick: { position: 'absolute', top: 0, bottom: 0, width: shape.hairline, backgroundColor: colors.bg },
  label: { color: colors.textDim, ...platformText },
  gain: { position: 'absolute', right: 0, top: -space.sm, color: colors.accent, ...platformText },
});
