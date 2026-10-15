/**
 * components/list/GlideCell.tsx: FlashList's cell (the absolutely placed
 * view each row sits in), which glides to a new place instead of jumping
 * while the list's `glide` is on (smooth-exit fix 2026-10-15).
 *
 * Layer: UI. A completed quest used to make room by shrinking its own row
 * frame by frame. FlashList places every cell from the JS thread, so it
 * followed each frame with relayouts, late and unevenly: the "frame lag"
 * when completing. Now the quest fades out at full size, the list drops it
 * in one update (one relayout), and the cells below move to their new
 * places with a native layout transition: the UI thread animates the
 * change between the old and new frames, with no work for JS on the way.
 *
 * The glide is on only around an exit (store `glide`: from the completion
 * until shortly after the quest has left). FlashList also moves cells when
 * it recycles them for other rows; those must not fly across the list, so
 * a cell skips the glide when the row it shows has just changed, and the
 * transition itself only animates moves of up to a screen's height.
 */
import { Children, forwardRef, isValidElement, type ReactNode, useState } from 'react';
import type { View, ViewProps } from 'react-native';
import Animated, { type LayoutAnimation, type LayoutAnimationsValues, withTiming } from 'react-native-reanimated';

import type { Row } from '@/lib/flatten';
import { useAppStore } from '@/store/react';
import { duration, easing } from '@/theme';

/**
 * The layout transition: the cell's top moves from where it was to where it
 * now belongs over duration.slow (out-cubic, the rows below gliding up as
 * on desktop). Size and left edge change at once. A move longer than the
 * window (a recycled cell sent elsewhere) is not animated either.
 */
function glideTransition(values: LayoutAnimationsValues): LayoutAnimation {
  'worklet';
  const distance = Math.abs(values.targetOriginY - values.currentOriginY);
  const glides = distance > 0 && distance <= values.windowHeight;
  return {
    initialValues: {
      originX: values.targetOriginX,
      originY: glides ? values.currentOriginY : values.targetOriginY,
      width: values.targetWidth,
      height: values.targetHeight,
    },
    animations: {
      originY: withTiming(values.targetOriginY, { duration: glides ? duration.slow : 0, easing }),
    },
  };
}

/** The id of the row a cell renders (FlashList passes renderItem's element, then a separator). */
function rowIdOf(children: ReactNode): string | undefined {
  const first = Children.toArray(children)[0];
  return isValidElement<{ row?: Row }>(first) ? first.props.row?.id : undefined;
}

type Props = ViewProps & { index?: number; children?: ReactNode };

/**
 * The cell: FlashList's own props (its absolute placement in `style`, its
 * `onLayout`, its ref for measuring) on an Animated.View that carries the
 * glide while the list's `glide` is on.
 */
export const GlideCell = forwardRef<View, Props>(function GlideCell({ children, index: _index, ...rest }, ref) {
  const glide = useAppStore((s) => s.glide);
  const id = rowIdOf(children);
  // The row this cell showed last, and whether it changed during this glide (it was recycled):
  // then its move is a jump to another place, never a glide. (The previous-props pattern.)
  const [shown, setShown] = useState(id);
  const [recycled, setRecycled] = useState(false);
  if (shown !== id) {
    setShown(id);
    if (glide) setRecycled(true);
  }
  if (!glide && recycled) setRecycled(false);

  return (
    <Animated.View ref={ref} {...rest} layout={glide && !recycled ? glideTransition : undefined}>
      {children}
    </Animated.View>
  );
});
