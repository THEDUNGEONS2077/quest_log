/**
 * components/list/FocusGlow.tsx: the soft green glow on the editing row
 * (PLAN §8.1, §10.9).
 *
 * Layer: UI. Mounted inside a row while it's being edited: it fills the
 * row, glows inward (so the rows around it can't cover it) and fades in
 * over 120 ms. It ignores touches and is invisible to screen readers.
 */
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { duration, glowShadow } from '@/theme';

/** The editing row's focus glow. */
export function FocusGlow() {
  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast)}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.glow}
    />
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, boxShadow: glowShadow.inset },
});
