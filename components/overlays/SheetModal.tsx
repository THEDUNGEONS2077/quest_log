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
 *
 * If the keyboard is open (a sheet opened while typing, e.g. DUE on the
 * editing toolbar), it is closed first and the sheet appears once it's gone:
 * see useAfterKeyboardCloses for the stuck quick-add bar this prevents.
 */
import { type ReactNode, useEffect } from 'react';
import { Modal, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useAfterKeyboardCloses } from '@/components/common/keyboard';
import { distance, duration, easing } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The sheet's own look (background, padding, max height). */
  sheetStyle: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** A bottom sheet in a modal: fading backdrop, rising sheet. Nothing is mounted while closed. */
export function SheetModal({ visible, ...rest }: Props) {
  // Mounted fresh for each opening, so the body's keyboard check and its
  // entrance animation start over every time.
  return visible ? <SheetBody {...rest} /> : null;
}

function SheetBody({ onClose, sheetStyle, children }: Omit<Props, 'visible'>) {
  // Shown only once the keyboard is closed (immediately when it already is).
  const ready = useAfterKeyboardCloses(true);
  // 0 = hidden, 1 = shown.
  const shown = useSharedValue(0);
  useEffect(() => {
    if (ready) shown.set(withTiming(1, { duration: duration.base, easing }));
  }, [ready, shown]);

  const backdrop = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const sheet = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * distance.sheet }] }));

  return (
    <Modal visible={ready} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
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
