/**
 * components/overlays/Toast.tsx: the bottom message with UNDO
 * (PLAN §9.13, §10.10).
 *
 *   COMPLETED · UNDO
 *
 * Layer: UI. Shows the store's current toast: slides up 16 pt with a fade
 * (200 ms), holds 5 s, then hides. A new toast (new key) restarts the
 * timer. UNDO undoes the most recent step, which is the one the toast
 * describes, because the toast appears right after it.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useActions, useAppStore } from '@/store/react';
import { colors, duration, easing, maxFontSizeMultiplier, platformText, shape, size, space, timing, type } from '@/theme';

/** Toast slide distance (PLAN §10.10). */
const SLIDE = space.lg;

export function Toast({ bottom }: { bottom: number }) {
  const toast = useAppStore((s) => s.toast);
  const actions = useActions();
  const shown = useSharedValue(0);

  // Animate in on each new toast; auto-hide after the hold time.
  useEffect(() => {
    if (!toast) {
      shown.value = withTiming(0, { duration: duration.base, easing });
      return;
    }
    shown.value = 0;
    shown.value = withTiming(1, { duration: duration.base, easing });
    const t = setTimeout(() => actions.dismissToast(toast.key), timing.toastHold);
    return () => clearTimeout(t);
  }, [toast, shown, actions]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * SLIDE }],
  }));

  if (!toast) return null;
  return (
    <Animated.View style={[styles.toast, { bottom }, style]} accessibilityLiveRegion="polite">
      <Text style={[type.meta, styles.message]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {toast.message}
      </Text>
      {toast.undo && (
        <Pressable
          onPress={() => {
            actions.undo();
            actions.dismissToast(toast.key);
          }}
          style={styles.undo}
          hitSlop={space.sm}
          accessibilityRole="button"
          accessibilityLabel="Undo"
        >
          <Text style={[type.meta, styles.undoText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            UNDO
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    minHeight: size.hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  message: { flex: 1, color: colors.textBright, ...platformText },
  undo: { minHeight: size.hitTarget, minWidth: size.hitTarget, paddingHorizontal: space.lg, justifyContent: 'center' },
  undoText: { color: colors.accent, ...platformText },
});
