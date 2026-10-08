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
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

export interface SheetAction {
  glyph: string;
  label: string;
  onPress: () => void;
  /** Leave the sheet open (the action shows a follow-up sheet, e.g. sort options). */
  keepOpen?: boolean;
}

interface Props {
  visible: boolean;
  /** Shown as `> title` at the top. */
  title: string;
  actions: SheetAction[];
  onClose: () => void;
  /** Optional content between the title and the actions (e.g. the priority selector). */
  children?: ReactNode;
}

/** The sheet never covers more than this share of the screen; longer menus scroll. */
const MAX_HEIGHT_SHARE = 0.85;

export function ActionSheet({ visible, title, actions, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* Backdrop: tap outside the sheet to close. */}
      {/* The backdrop isn't a screen-reader element (it would swallow the sheet's text);
          Android back closes the sheet instead. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + space.sm, maxHeight: height * MAX_HEIGHT_SHARE }]}
          onPress={() => {}}
          accessible={false}
        >
          <Text style={[type.body, styles.title]} numberOfLines={2} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.prompt.glyph} ${title}`}
          </Text>
          <View style={styles.divider} />
          <ScrollView bounces={false}>
            {children}
            {actions.map((a) => (
              <Pressable
                key={a.label}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                onPress={() => {
                  if (!a.keepOpen) onClose();
                  a.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={a.label}
              >
                <Text style={[type.glyph, styles.glyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {a.glyph}
                </Text>
                <Text style={[type.body, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
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
