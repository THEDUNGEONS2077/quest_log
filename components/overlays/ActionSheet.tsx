/**
 * components/overlays/ActionSheet.tsx: a terminal-style bottom sheet of
 * actions (PLAN §12.6 style).
 *
 *   > Plan trip
 *   ────────────
 *   ↺ Restore
 *   ⊞ Run again
 *   ✕ Delete
 *
 * Layer: UI. Used by the COMPLETED tab (long-press a row, CLEAR…). The
 * Phase 6 context menu builds on it. Options sit at the bottom of the
 * screen, within thumb reach, and each row is at least 52 pt tall. Tapping
 * outside or pressing back closes it.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

export interface SheetAction {
  glyph: string;
  label: string;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  /** Shown as `> title` at the top. */
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}

export function ActionSheet({ visible, title, actions, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* Backdrop: tap outside the sheet to close. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.sm }]} onPress={() => {}} accessible={false}>
          <Text style={[type.body, styles.title]} numberOfLines={2} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.prompt.glyph} ${title}`}
          </Text>
          <View style={styles.divider} />
          {actions.map((a) => (
            <Pressable
              key={a.label}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <Text style={[type.body, styles.glyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {a.glyph}
              </Text>
              <Text style={[type.body, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Black at 60% over the list: the sheet reads as the only thing to act on.
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: shape.hairline,
    borderColor: colors.line,
    borderTopLeftRadius: shape.radius,
    borderTopRightRadius: shape.radius,
    paddingTop: space.lg,
  },
  title: { color: colors.textBright, paddingHorizontal: space.lg, ...platformText },
  divider: { height: shape.hairline, backgroundColor: colors.line, marginTop: space.md },
  action: { flexDirection: 'row', alignItems: 'center', minHeight: size.rowMinHeight, paddingHorizontal: space.lg },
  pressed: { backgroundColor: colors.surface },
  glyph: { color: colors.accent, width: size.indent + space.sm, ...platformText },
  label: { color: colors.text, ...platformText },
});
