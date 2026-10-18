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
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolateColor, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useSameItem } from '@/components/common/motion';
import { haptics } from '@/services/haptics';
import { colors, duration, easing, maxFontSizeMultiplier, platformText, space, timing, type } from '@/theme';

/** Fraction of the row width a swipe must pass to commit (PLAN §9.5). */
const COMMIT_FRACTION = 0.4;
/** A pan threshold no finger reaches: the pan that's on only for the pressed light never swipes. */
const NEVER = 100000;
/** The pressed light's resting color: the row's own background shows through. */
const PRESS_REST = 'transparent';

export interface SwipeAction {
  /** Track label, for example "[x] DONE" or "✕ DEL". */
  label: string;
  onCommit: () => void;
  /**
   * The row leaves the list (delete, restore): it stays slid out instead of
   * springing back, while its gap closes (rowCollapse.ts).
   */
  leaves?: boolean;
}

interface Props {
  /** The task shown: when the list reuses the row for another one, it starts centred again. */
  id: string;
  children: ReactNode;
  /** Swipe right (track on the left). */
  right?: SwipeAction;
  /** Swipe left (track on the right). */
  left?: SwipeAction;
  /** Off while editing, or when swipe actions are turned off in Settings. */
  enabled: boolean;
  /**
   * The row lights while a finger rests on it (touch-down feedback, also during a hold before
   * a drag or the menu), even with swipes off. Off while the row is being edited.
   */
  pressable?: boolean;
  /**
   * A long-press drag gesture (drag.tsx) to race against the swipe: a quick
   * sideways move swipes, holding still for 300 ms starts a drag.
   */
  drag?: ReturnType<typeof Gesture.Pan> | null;
}

/** Each mounted row's current swipe actions, by its own key (useId), read when a swipe commits. */
const current = new Map<string, { right?: SwipeAction; left?: SwipeAction }>();

/** Runs the action of the side swiped past (1: the right swipe's, -1: the left's) of row `key`. */
function commitSwipe(key: string, side: number): void {
  const actions = current.get(key);
  (side > 0 ? actions?.right : actions?.left)?.onCommit();
}

export function SwipeableRow({ id, children, right, left, enabled, drag, pressable = false }: Props) {
  const x = useSharedValue(0);
  // 0 → 1: the row's pressed light (see `pressable`).
  const press = useSharedValue(0);
  // A row left slid out (it was leaving) and reused by the list for another task: centred.
  const sameItem = useSameItem(id);
  useEffect(() => {
    if (!sameItem()) x.set(0);
  }, [sameItem, x]);
  const width = useSharedValue(1);
  // Which side is past the threshold right now (-1, 0, 1), so the haptic ticks once per crossing.
  const armed = useSharedValue(0);
  // The tracks under the row exist only while it's swiped: mounted as a swipe starts, gone once
  // the row is back at rest; a row reused for another task starts without them (the
  // previous-props pattern). Responsiveness pass 2026-10-18: every row built both tracks and
  // their animated styles whenever a list opened.
  const [swiping, setSwiping] = useState(false);
  const [trackFor, setTrackFor] = useState(id);
  if (trackFor !== id) {
    setTrackFor(id);
    setSwiping(false);
  }

  // The latest actions, read when a swipe commits (the `current` table, by this row's own
  // key): the gesture itself is built once per row shape (enabled, which sides), not on every
  // render, so a re-render (typing in the title, say) doesn't rebuild it and send its worklets
  // to the UI thread again.
  const key = useId();
  useEffect(() => {
    current.set(key, { right, left });
  });
  useEffect(() => () => void current.delete(key), [key]);
  const hasRight = right !== undefined;
  const hasLeft = left !== undefined;
  const leavesRight = right?.leaves === true;
  const leavesLeft = left?.leaves === true;

  const swipes = enabled && (hasRight || hasLeft);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        // On for swipes, or (swipes off) only to light the row while it's pressed: then it can
        // never activate, so it never swipes and never holds up the drag or a scroll.
        .enabled(swipes || pressable)
        .activeOffsetX(swipes ? [-16, 16] : [-NEVER, NEVER])
        .failOffsetY([-12, 12])
        // Touch-down feedback (refinement pass 2026-10-18): a finger that stays on the row for
        // the tap timeout lights it, so a tap, a hold (drag, menu) all show they've landed; a
        // scroll moves on before that. Out again when the finger lifts, scrolls or swipes.
        .onBegin(() => {
          if (pressable) press.set(withDelay(timing.pressDelay, withTiming(1, { duration: duration.fast, easing })));
        })
        .onFinalize(() => {
          press.set(withTiming(0, { duration: duration.fast, easing }));
        })
        .onStart(() => {
          press.set(withTiming(0, { duration: duration.fast, easing }));
          scheduleOnRN(setSwiping, true);
        })
        .onUpdate((e) => {
          // Only allow directions that have an action.
          const dx = e.translationX;
          x.set((dx > 0 && !hasRight) || (dx < 0 && !hasLeft) ? 0 : dx);
          const side = Math.abs(x.get()) > width.get() * COMMIT_FRACTION ? Math.sign(x.get()) : 0;
          if (side !== armed.get()) {
            armed.set(side);
            if (side !== 0) scheduleOnRN(haptics.tick);
          }
        })
        .onEnd(() => {
          const side = armed.get();
          armed.set(0);
          if (side === 0) {
            x.set(
              withTiming(0, { duration: duration.fast, easing }, (finished) => {
                if (finished) scheduleOnRN(setSwiping, false);
              }),
            );
            return;
          }
          // Slide fully out in the swipe direction and run the action. Rows that stay
          // (a checked subtask) come back; rows that leave stay out while their gap closes.
          const leaves = side > 0 ? leavesRight : leavesLeft;
          x.set(
            withTiming(side * width.get(), { duration: duration.fast, easing }, () => {
              scheduleOnRN(commitSwipe, key, side);
              if (!leaves)
                x.set(
                  withTiming(0, { duration: duration.base, easing }, (finished) => {
                    if (finished) scheduleOnRN(setSwiping, false);
                  }),
                );
            }),
          );
        }),
    [swipes, pressable, hasRight, hasLeft, leavesRight, leavesLeft, key, x, width, armed, press],
  );
  const gesture = useMemo(() => (drag ? Gesture.Race(drag, pan) : pan), [drag, pan]);
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    backgroundColor: interpolateColor(press.get(), [0, 1], [PRESS_REST, colors.surfaceRaised]),
  }));

  return (
    <View onLayout={(e) => width.set(Math.max(1, e.nativeEvent.layout.width))}>
      {/* Tracks sit underneath and show through as the row slides (only while it does). */}
      {swiping && <SwipeTracks x={x} right={right} left={left} />}
      <GestureDetector gesture={gesture}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

/** The tracks under a row being swiped: the right action's on the left, the left's on the right. */
function SwipeTracks({ x, right, left }: { x: SharedValue<number>; right?: SwipeAction; left?: SwipeAction }) {
  const rightTrack = useAnimatedStyle(() => ({ opacity: x.get() > 0 ? 1 : 0 }));
  const leftTrack = useAnimatedStyle(() => ({ opacity: x.get() < 0 ? 1 : 0 }));
  return (
    <>
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
    </>
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
