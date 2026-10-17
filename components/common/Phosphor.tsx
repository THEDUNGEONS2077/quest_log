/**
 * components/common/Phosphor.tsx: the terminal screen behind the chrome
 * (aesthetic pass 2026-10-17): a soft phosphor light from the top-left
 * corner and fine scanlines, as on the desktop's masthead.
 *
 * Layer: UI. Fills its parent, behind the content (render it first), and
 * takes no touches and no screen-reader focus.
 *
 * `animated` (the main screen's top panel only; user request 2026-10-17:
 * "animate the top bar's scanlines … similar to the desktop app, keep it
 * subtle"): as on the desktop's masthead, the scanlines drift slowly down
 * (one 3 pt pitch every 1.8 s) and a soft bright band passes down the panel
 * every 7 s. Kept cheap, since a screen that keeps changing keeps the phone
 * drawing: both only move a layer on the UI thread (nothing is laid out
 * again); the drift goes in steps of about one pixel, so the panel is
 * redrawn a few times a second rather than every frame; the band moves for
 * 2.8 s of every 7. Both stop while the main screen isn't showing (another
 * screen over it, the app in the background; the main screen passes
 * `animated` only once the boot screen has gone) and under Reduce Motion.
 * Elsewhere (the pages' headers, the boot screen) the lines are still.
 */
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, type LayoutChangeEvent, PixelRatio, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { backgroundStyle, easingScan, easingScanSteps, effects, SCAN_PITCH, scanlineTile, timing } from '@/theme';

import { useReduceMotion } from './motion';

/** The refresh band's height, as a share of the panel's (the desktop's). */
const BAND_SHARE = 0.45;
/** Where the band starts and ends, in its own heights from the panel's top: out of sight above, then below (the desktop's). */
const BAND_FROM = -1.1;
const BAND_TO = 2.4;

/** The phosphor wash and scanlines, filling the parent; drifting, with a passing band, when `animated`. */
export function Phosphor({ animated = false }: { animated?: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, animated && styles.clip]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[StyleSheet.absoluteFill, backgroundStyle(effects.phosphor)]} />
      {animated ? (
        <LiveScan />
      ) : (
        <View style={[StyleSheet.absoluteFill, backgroundStyle(effects.scanlines, scanlineTile.size, scanlineTile.repeat)]} />
      )}
    </View>
  );
}

/** Whether the app is in the foreground. */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** The drifting scanlines and the passing band, running only while they can be seen. */
function LiveScan() {
  const focused = useIsFocused();
  const active = useAppActive();
  const reduce = useReduceMotion();
  const running = focused && active && !reduce;
  // The panel's height, for the band's size and travel.
  const [height, setHeight] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  // The lines: a layer one pitch taller than the panel, moved down by that pitch and started
  // over, which reads as an endless drift (the pattern repeats every pitch). Each run starts
  // from 0: a repeat goes back to where its run started, and from anywhere else the start-over
  // would show as a jump.
  const drift = useSharedValue(0);
  useEffect(() => {
    if (!running) return;
    const steps = Math.max(1, Math.round(SCAN_PITCH * PixelRatio.get()));
    drift.set(0);
    drift.set(withRepeat(withTiming(SCAN_PITCH, { duration: timing.scanDrift, easing: easingScanSteps(steps) }), -1, false));
    return () => cancelAnimation(drift);
  }, [running, drift]);
  const lines = useAnimatedStyle(() => ({ transform: [{ translateY: drift.get() }] }));

  // The band: rests out of sight above the panel, then passes down and out below it. Its resting
  // place is its layout (`top`), so it's out of sight before its motion starts, whatever the panel's
  // height was when the motion was set up; the motion only moves it down from there.
  const pass = useSharedValue(0);
  useEffect(() => {
    if (!running || !height) return;
    pass.set(0);
    pass.set(
      withRepeat(
        withSequence(
          withDelay(timing.scanBandRest, withTiming(1, { duration: timing.scanBandPass, easing: easingScan })),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(pass);
      pass.set(0);
    };
  }, [running, height, pass]);
  const bandHeight = height * BAND_SHARE;
  const band = useAnimatedStyle(() => ({ transform: [{ translateY: pass.get() * (BAND_TO - BAND_FROM) * bandHeight }] }));

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {/* (The test IDs are for the tests: they read the layers' motion.) */}
      <Animated.View testID="scanlines" style={[styles.lines, backgroundStyle(effects.scanlines, scanlineTile.size, scanlineTile.repeat), lines]} />
      {height > 0 && (
        <Animated.View testID="scan-band" style={[styles.band, { top: BAND_FROM * bandHeight, height: bandHeight }, backgroundStyle(effects.band), band]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The drifting layer and the band reach past the panel's edges: the panel shows only its own area.
  clip: { overflow: 'hidden' },
  lines: { position: 'absolute', left: 0, right: 0, top: -SCAN_PITCH, bottom: 0 },
  band: { position: 'absolute', left: 0, right: 0 },
});
