/**
 * components/overlays/Toast.tsx: the bottom message with UNDO
 * (PLAN §9.13, §10.10).
 *
 *   COMPLETED · UNDO
 *
 * Layer: UI. Shows the store's current toast: slides up `distance.nudge`
 * with a fade (base), holds 5 s, then leaves the way it came (slides down
 * and fades, base) rather than vanishing. A new toast (new key) restarts
 * the timer. UNDO undoes the most recent step, which is the one the toast
 * describes, because the toast appears right after it; it can't be tapped
 * while the toast is leaving.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useActions, useAppStore } from '@/store/react';
import { colors, distance, duration, easing, maxFontSizeMultiplier, platformText, shape, size, space, timing, type } from '@/theme';

export function Toast({ bottom }: { bottom: number }) {
  const toast = useAppStore((s) => s.toast);
  const actions = useActions();
  const shown = useSharedValue(0);
  // The toast drawn: the store's, or the last one while it's leaving.
  const [drawn, setDrawn] = useState(toast);
  if (toast && toast !== drawn) setDrawn(toast);
  const leaving = !toast && drawn !== null;

  // Animate in on each new toast; auto-hide after the hold time.
  useEffect(() => {
    if (!toast) return;
    shown.set(0);
    shown.set(withTiming(1, { duration: duration.base, easing }));
    const t = setTimeout(() => actions.dismissToast(toast.key), timing.toastHold);
    return () => clearTimeout(t);
  }, [toast, shown, actions]);

  // Leave the way it came, then unmount.
  useEffect(() => {
    if (!leaving) return;
    shown.set(withTiming(0, { duration: duration.base, easing }));
    const t = setTimeout(() => setDrawn(null), duration.base);
    return () => clearTimeout(t);
  }, [leaving, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * distance.nudge }],
  }));

  if (!drawn) return null;
  return (
    <Animated.View
      style={[styles.toast, { bottom }, style]}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityLiveRegion="polite"
      testID="toast"
    >
      <Text style={[type.meta, styles.message]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {drawn.message}
      </Text>
      {drawn.undo && (
        <Pressable
          onPress={() => {
            actions.undo();
            actions.dismissToast(drawn.key);
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
