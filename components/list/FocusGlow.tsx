/**
 * components/list/FocusGlow.tsx: the soft green glow on the editing row
 * (PLAN §8.1, §10.9).
 *
 * Layer: UI. Mounted inside a row while it's being edited: it fills the
 * row, glows inward (so the rows around it can't cover it) and fades in
 * over `duration.fast`. It ignores touches and is invisible to screen
 * readers. The fade is a plain shared-value animation like every other one
 * (not a layout "entering" animation, which recycled list rows make
 * unreliable).
 */
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, easing, glowShadow } from '@/theme';

/** The editing row's focus glow. */
export function FocusGlow() {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(1, { duration: duration.fast, easing }));
  }, [shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.glow, fade]}
    />
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, boxShadow: glowShadow.inset },
});
