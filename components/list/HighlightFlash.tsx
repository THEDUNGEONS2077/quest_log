/**
 * components/list/HighlightFlash.tsx: the "here it is" flash for a task opened
 * from a notification or link (PLAN §10.11).
 *
 * Layer: UI. When the store's `highlightId` is this row, a surfaceRaised
 * overlay behind the row's content flashes twice over 800 ms (UI thread),
 * then the highlight is cleared. It's an overlay, not the row background,
 * because rows stay opaque to hide the swipe track. Reanimated skips the
 * flash under Reduce Motion; the list has already scrolled to the row.
 *
 * Usage: `<HighlightFlash rowId={id} />` as the row's first child.
 */
import { StyleSheet } from 'react-native';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useActions, useAppStore } from '@/store/react';
import { colors, easing, timing } from '@/theme';

/** The flash overlay for one row (renders nothing visible unless highlighted). */
export function HighlightFlash({ rowId }: { rowId: string }) {
  const active = useAppStore((s) => s.highlightId === rowId);
  const actions = useActions();
  const flash = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    // Two pulses: each up then down in a quarter of the total time.
    const quarter = timing.highlight / 4;
    flash.value = withRepeat(withSequence(withTiming(1, { duration: quarter, easing }), withTiming(0, { duration: quarter, easing })), 2);
    const t = setTimeout(actions.clearHighlight, timing.highlight);
    return () => clearTimeout(t);
  }, [active, flash, actions]);

  const style = useAnimatedStyle(() => ({ opacity: flash.value }));
  return <Animated.View pointerEvents="none" style={[styles.overlay, style]} />;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.surfaceRaised },
});
