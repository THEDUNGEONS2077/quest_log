/**
 * components/edit/EditingChips.tsx: while a task's title is being edited,
 * its chips (what the typed shorthand will do, and its current priority,
 * due date and repeat, clearable) float just above the line being typed
 * (user request 2026-10-11).
 *
 *   ◔ TOMORROW 10:00  ↻ DAILY        ← the chips, above the text
 *   [ ] Call the bank @tomorrow 10am█
 *
 * Layer: UI. Before, the chips sat under the title inside the row, and the
 * typed line is always kept just above the editing toolbar (keepInView), so
 * they were hidden behind the toolbar and keyboard. Now they're an overlay
 * drawn over the list, not part of the row: the row doesn't change size
 * when they appear, so nothing moves while typing. This matches quick-add,
 * whose chips sit above its field.
 *
 * Placement: the focused field and the list are measured in window
 * coordinates (as keepInView does). The strip sits GAP above the field's
 * top line; when there isn't room above (the field near the top of the
 * list), just below it. It's measured again as the title changes, when the
 * list scrolls (`measureRef`), when the keyboard moves, and twice a second
 * as a fallback. It fades in once placed; its position lives in animated
 * values, so following the field re-renders nothing.
 */
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { Keyboard, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { focusedInput } from '@/components/list/focusedInput';
import { findTask } from '@/lib/taskMap';
import { useAppStore } from '@/store/react';
import { duration, easing, space } from '@/theme';

import { TaskChips } from './ParsedChips';

/** Space between the strip and the line being typed. */
const GAP = space.xs;
/** Fallback re-measure interval while editing (the list or keyboard may have moved). */
const REMEASURE_MS = 500;
/** Once editing has started, the list and keyboard have settled by then. */
const SETTLE_MS = 350;

/** measureInWindow as a promise: the view's frame in window coordinates, or null. */
function frame(view: View | null): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => resolve(height > 0 ? { x, y, width, height } : null));
  });
}

interface Props {
  /** The list's outer view: the strip is positioned inside it. */
  container: RefObject<View | null>;
  /** Filled with the re-measure function, for the list to call when it scrolls. */
  measureRef?: RefObject<(() => void) | null>;
}

/** The floating chips for the task whose title is being edited (renders nothing otherwise). */
export function EditingChips({ container, measureRef }: Props) {
  const id = useAppStore((s) => (s.editingField === 'title' ? s.editingId : null));
  // The title, to re-measure as it changes: chips come and go as shorthand is typed,
  // and the field can grow a line or the list snap to keep it in view.
  const title = useAppStore((s) => (id ? (findTask(s.tasks, id)?.title ?? '') : ''));
  // Where the strip goes (inside the list) and whether it's shown: animated values, so
  // following the field never re-renders anything.
  const top = useSharedValue(0);
  const left = useSharedValue(0);
  const shown = useSharedValue(0);
  // The strip's own height (0 while there are no chips): decides above or below.
  const height = useRef(0);

  const measure = useCallback(() => {
    if (height.current === 0) return;
    void Promise.all([frame(focusedInput()), frame(container.current)]).then(([field, list]) => {
      if (!field || !list) return;
      const above = field.y - list.y - height.current - GAP;
      top.set(above >= 0 ? above : field.y + field.height - list.y + GAP);
      left.set(Math.max(0, field.x - list.x));
      if (shown.get() === 0) shown.set(withTiming(1, { duration: duration.fast, easing }));
    });
  }, [container, top, left, shown]);

  useEffect(() => {
    if (measureRef) measureRef.current = measure;
  }, [measureRef, measure]);

  // A new editing session starts hidden, until it's placed.
  useEffect(() => {
    shown.set(0);
  }, [id, shown]);

  useEffect(() => {
    if (!id) return;
    measure();
    const settle = setTimeout(measure, SETTLE_MS);
    const every = setInterval(measure, REMEASURE_MS);
    const subs = [Keyboard.addListener('keyboardDidShow', measure), Keyboard.addListener('keyboardDidHide', measure)];
    return () => {
      clearTimeout(settle);
      clearInterval(every);
      subs.forEach((sub) => sub.remove());
    };
  }, [id, title, measure]);

  const onLayout = (e: LayoutChangeEvent) => {
    height.current = e.nativeEvent.layout.height;
    measure();
  };

  const style = useAnimatedStyle(() => ({ top: top.get(), left: left.get(), opacity: shown.get() }));

  if (!id) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.strip, style]} onLayout={onLayout}>
      <TaskChips id={id} style={styles.chips} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Right edge kept inside the list; the chips wrap within.
  strip: { position: 'absolute', right: space.lg },
  // No margin of its own: GAP is the only space between strip and text.
  chips: { marginTop: 0 },
});
