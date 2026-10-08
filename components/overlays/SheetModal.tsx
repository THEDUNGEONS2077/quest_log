/**
 * components/overlays/SheetModal.tsx: the frame every bottom sheet shares
 * (action sheets, the context menu, the due-date and repeat sheets).
 *
 * Layer: UI. A transparent modal with two layers:
 *   - a dimmed backdrop that fades in; tapping it closes the sheet,
 *   - the sheet, which rises into place from just below while fading in
 *     (200 ms, the app's easing).
 * The motion is a plain shared-value animation (the same technique as the
 * toast), not a layout animation, so it behaves the same inside a modal on
 * every Android version. With Reduce Motion it appears at once (Reanimated's
 * global config).
 *
 * The backdrop isn't a screen-reader element: it would swallow the sheet's
 * text. Android back closes the sheet instead (onRequestClose).
 */
import { type ReactNode, useEffect } from 'react';
import { Modal, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, easing, space } from '@/theme';

/** How far below its resting place the sheet starts. */
const RISE = space.xl * 3;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The sheet's own look (background, padding, max height). */
  sheetStyle: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** A bottom sheet in a modal: fading backdrop, rising sheet. */
export function SheetModal({ visible, onClose, sheetStyle, children }: Props) {
  // 0 = hidden, 1 = shown. Replays each time the sheet opens.
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(0);
    if (visible) shown.set(withTiming(1, { duration: duration.base, easing }));
  }, [visible, shown]);

  const backdrop = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const sheet = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * RISE }] }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[styles.backdrop, backdrop]}>
        <Pressable style={styles.fill} onPress={onClose} accessible={false} />
      </Animated.View>
      {/* box-none: taps above the sheet reach the backdrop. */}
      <View style={styles.bottom} pointerEvents="box-none">
        <Animated.View style={[sheetStyle, sheet]}>{children}</Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Black at 60% over the list: the sheet reads as the only thing to act on.
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)' },
  fill: { flex: 1 },
  bottom: { flex: 1, justifyContent: 'flex-end' },
});
