/**
 * components/common/XpBar.tsx: the XP bar under the tabs (user request
 * 2026-10-09), drawn as a terminal gauge (aesthetic pass 2026-10-17, as on
 * the desktop).
 *
 *   [▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯]  34/50 XP
 *
 * Layer: UI. 20 block cells between dim brackets: unlit cells show faintly
 * (xpWash), lit ones in accent, brightest at the leading edge, which glows
 * softly onto the next cell (the app's one effect). The fill is snapped to
 * whole cells, so a cell is either earned or not. The level itself is in
 * the header (`<7>_quest_log`).
 *
 * When XP is earned the fill glides forward and a small "+18" floats up and
 * fades, in step with the "+18 XP" on the completed row (useFloatUp). On a
 * level-up the fill runs to the end, then starts again from empty. The
 * fill moves by translation, not width, so nothing is laid out again while
 * it glides; fixed black gaps over it cut it into cells. With Reduce Motion
 * every change is instant (global config).
 */
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { levelInfo } from '@/lib/xp';
import { useAppStore } from '@/store/react';
import {
  backgroundStyle,
  colors,
  distance,
  duration,
  easing,
  effects,
  fonts,
  glowShadow,
  glowText,
  maxFontSizeMultiplier,
  platformText,
  space,
  type,
} from '@/theme';

import { useFloatUp } from './motion';

/** Cells in the gauge (the desktop's count). */
export const XP_CELLS = 20;
/** The black gap between two cells (pt). */
const CELL_GAP = 2;

/**
 * The share of the gauge to light: whole cells only, and at least one as
 * soon as any XP is earned into the level (so a first gain always shows).
 */
export function litShare(into: number, fraction: number): number {
  const cells = into > 0 ? Math.max(1, Math.floor(fraction * XP_CELLS)) : 0;
  return Math.min(XP_CELLS, cells) / XP_CELLS;
}

export function XpBar() {
  const xp = useAppStore((s) => s.tasks.progress.xp);
  const { level, into, needed, fraction } = levelInfo(xp);
  const lit = litShare(into, fraction);

  // The fill: glides to the new share; on a level-up it first runs to the end.
  const fill = useSharedValue(lit);
  const shownLevel = useRef(level);
  useEffect(() => {
    const ease = { duration: duration.slow, easing };
    if (level > shownLevel.current) {
      fill.set(withSequence(withTiming(1, { duration: duration.base, easing }), withTiming(0, { duration: 0 }), withTiming(lit, ease)));
    } else {
      fill.set(withTiming(lit, ease));
    }
    shownLevel.current = level;
  }, [level, lit, fill]);
  // The track's width, measured: the fill (as wide as the track) slides in from the left by
  // the unlit share. Hidden until measured, so it never shows full for a frame; and it fades
  // in over the first cell, so with nothing earned its glow doesn't light the first cell.
  const trackWidth = useSharedValue(0);
  const onTrackLayout = (e: LayoutChangeEvent) => trackWidth.set(e.nativeEvent.layout.width);
  const fillStyle = useAnimatedStyle(() => {
    const share = Math.min(1, Math.max(0, fill.get()));
    return {
      opacity: trackWidth.get() > 0 ? Math.min(1, share * XP_CELLS) : 0,
      transform: [{ translateX: (share - 1) * trackWidth.get() }],
    };
  });

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
      <View style={styles.gauge}>
        <Text style={[type.meta, styles.bracket]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          [
        </Text>
        <View style={styles.track} onLayout={onTrackLayout}>
          <Animated.View style={[styles.fill, backgroundStyle(effects.gauge), fillStyle]} />
          {/* The gaps between cells, over the fill: they cut it into blocks. */}
          {Array.from({ length: XP_CELLS - 1 }, (_, i) => (
            <View key={i} style={[styles.gap, { left: `${((i + 1) * 100) / XP_CELLS}%` }]} />
          ))}
        </View>
        <Text style={[type.meta, styles.bracket]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          ]
        </Text>
      </View>
      <View>
        <Text style={[type.meta, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          <Text style={styles.into}>{into}</Text>
          {`/${needed} XP`}
        </Text>
        {gain.amount > 0 && <GainLabel key={gain.key} amount={gain.amount} />}
      </View>
    </View>
  );
}

/**
 * "+18" that floats up from the XP count and fades (mounted fresh for each
 * gain), with the same motion as the row's "+N XP" (useFloatUp).
 */
function GainLabel({ amount }: { amount: number }) {
  const style = useFloatUp(1, distance.nudge);
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
  // 80% opacity: present but quieter than the quest tabs above it (user request 2026-10-09).
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    minHeight: 20,
    opacity: 0.8,
  },
  gauge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bracket: { color: colors.textDim, ...platformText },
  // Unlit cells show faintly; the track clips the fill as it slides in.
  track: { flex: 1, height: TRACK, backgroundColor: colors.xpWash, overflow: 'hidden' },
  // As wide as the track; the accent fallback shows if the gradient isn't drawn.
  fill: { ...StyleSheet.absoluteFill, backgroundColor: colors.accent, boxShadow: glowShadow.outset },
  // Centred on each cell boundary.
  gap: { position: 'absolute', top: 0, bottom: 0, width: CELL_GAP, marginLeft: -CELL_GAP / 2, backgroundColor: colors.bg },
  label: { color: colors.textDim, ...platformText },
  // The XP earned into this level reads first: bright, the total after it dim.
  into: { color: colors.textBright },
  gain: { position: 'absolute', right: 0, top: -space.sm, color: colors.accent, fontFamily: fonts.bold, ...glowText, ...platformText },
});
