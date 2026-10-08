/**
 * components/list/SwipeableRow.tsx: swipe right / swipe left actions on a
 * row (PLAN §9.5, §9.6).
 *
 * Layer: UI. Dragging the row sideways reveals a green track with the
 * action's label. Passing 40% of the row width ticks a haptic, and
 * releasing past it commits the action; otherwise the row springs back.
 *
 * Gesture tuning so swipes never fight scrolling: the pan activates only
 * after 16 pt of horizontal movement, and fails as soon as the finger moves
 * 12 pt vertically (that's a scroll). All motion runs on the UI thread;
 * only the commit callback crosses to JS.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/services/haptics';
import { colors, duration, easing, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

/** Fraction of the row width a swipe must pass to commit (PLAN §9.5). */
const COMMIT_FRACTION = 0.4;

export interface SwipeAction {
  /** Track label, for example "[x] DONE" or "✕ DEL". */
  label: string;
  onCommit: () => void;
}

interface Props {
  children: ReactNode;
  /** Swipe right (track on the left). */
  right?: SwipeAction;
  /** Swipe left (track on the right). */
  left?: SwipeAction;
  /** Off while editing, or when swipe actions are turned off in Settings. */
  enabled: boolean;
  /**
   * A long-press drag gesture (drag.tsx) to race against the swipe: a quick
   * sideways move swipes, holding still for 300 ms starts a drag.
   */
  drag?: ReturnType<typeof Gesture.Pan> | null;
}

export function SwipeableRow({ children, right, left, enabled, drag }: Props) {
  const x = useSharedValue(0);
  const width = useSharedValue(1);
  // Which side is past the threshold right now (-1, 0, 1), so the haptic ticks once per crossing.
  const armed = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(enabled && Boolean(right || left))
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      // Only allow directions that have an action.
      const dx = e.translationX;
      x.value = (dx > 0 && !right) || (dx < 0 && !left) ? 0 : dx;
      const side = Math.abs(x.value) > width.value * COMMIT_FRACTION ? Math.sign(x.value) : 0;
      if (side !== armed.value) {
        armed.value = side;
        if (side !== 0) scheduleOnRN(haptics.tick);
      }
    })
    .onEnd(() => {
      const side = armed.value;
      armed.value = 0;
      if (side === 0) {
        x.value = withTiming(0, { duration: duration.fast, easing });
        return;
      }
      // Slide fully out in the swipe direction, run the action, then reset.
      // Rows that stay (a checked subtask) come back; rows that leave are recycled.
      x.value = withTiming(side * width.value, { duration: duration.fast, easing }, () => {
        scheduleOnRN(side > 0 ? right!.onCommit : left!.onCommit);
        x.value = withTiming(0, { duration: duration.base, easing });
      });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const rightTrack = useAnimatedStyle(() => ({ opacity: x.value > 0 ? 1 : 0 }));
  const leftTrack = useAnimatedStyle(() => ({ opacity: x.value < 0 ? 1 : 0 }));

  return (
    <View onLayout={(e) => (width.value = Math.max(1, e.nativeEvent.layout.width))}>
      {/* Tracks sit underneath and show through as the row slides. */}
      {right && (
        <Animated.View style={[styles.track, styles.trackRight, rightTrack]} pointerEvents="none">
          <Text style={[type.meta, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {right.label}
          </Text>
        </Animated.View>
      )}
      {left && (
        <Animated.View style={[styles.track, styles.trackLeft, leftTrack]} pointerEvents="none">
          <Text style={[type.meta, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {left.label}
          </Text>
        </Animated.View>
      )}
      <GestureDetector gesture={drag ? Gesture.Race(drag, pan) : pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    backgroundColor: colors.surfaceRaised,
  },
  trackRight: { alignItems: 'flex-start' },
  trackLeft: { alignItems: 'flex-end' },
  label: { color: colors.accent, ...platformText },
});
