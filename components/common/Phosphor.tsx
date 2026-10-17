/**
 * components/common/Phosphor.tsx: the terminal screen behind the chrome
 * (aesthetic pass 2026-10-17): a soft phosphor light from the top-left
 * corner and fine static scanlines, as on the desktop's masthead.
 *
 * Layer: UI. Fills its parent, behind the content (render it first), and
 * takes no touches and no screen-reader focus. Static: drawn once, never
 * animated (no battery cost).
 */
import { StyleSheet, View } from 'react-native';

import { backgroundStyle, effects, scanlineTile } from '@/theme';

/** The phosphor wash and scanlines, filling the parent. */
export function Phosphor() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[StyleSheet.absoluteFill, backgroundStyle(effects.phosphor)]} />
      <View style={[StyleSheet.absoluteFill, backgroundStyle(effects.scanlines, scanlineTile.size, scanlineTile.repeat)]} />
    </View>
  );
}
