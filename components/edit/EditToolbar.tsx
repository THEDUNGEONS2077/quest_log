/**
 * components/edit/EditToolbar.tsx: the toolbar shown above the keyboard
 * while a task is being edited (PLAN §12.3 accessory bar, first part).
 *
 *   [← OUT] [→ IN] [+ SUB] [! PRI] [≡ NOTE] [◔ DUE] [↩ UNDO] [✓ DONE]
 *
 * Layer: UI. Brought forward from Phase 6 after the v0.3.0 test: building
 * structure needed a way to indent and add subtasks without pasting. It
 * replaces the quick-add bar while editing, so the two never overlap, and
 * it sits at the bottom of the screen, within thumb reach.
 *
 * Closing the keyboard (the system back gesture) also finishes editing,
 * so "how do I get out of editing" always has an obvious answer.
 * PRI cycles the priority (none → ! → !! → !!!); NOTE switches between
 * the title and the notes field. DUE opens the due-date sheet; it closes
 * the keyboard, which ends editing (the sheet is a separate step).
 */
import { useEffect } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { registerFloor } from '@/components/list/keepInView';
import { useActions, useAppStore, useStoreBundle } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

interface ButtonSpec {
  glyph: string;
  label: string;
  /** Spoken by screen readers. */
  a11y: string;
  onPress: () => void;
}

interface Props {
  editingId: string;
  /** Show OUT / IN / + SUB (ACTIVE tab). The COMPLETED tab is ordered by date, so it only gets UNDO / DONE. */
  structure: boolean;
}

export function EditToolbar({ editingId, structure }: Props) {
  const actions = useActions();
  const { store } = useStoreBundle();
  const insets = useSafeAreaInsets();
  const field = useAppStore((s) => s.editingField);

  // The keyboard closing (back gesture, or the keyboard's own hide key) ends editing.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      const id = store.getState().editingId;
      if (id) actions.finishEditing(id);
    });
    return () => sub.remove();
  }, [actions, store]);

  const structureButtons: ButtonSpec[] = [
    { glyph: glyphs.outdent.glyph, label: 'OUT', a11y: 'Outdent', onPress: () => actions.outdentTask(editingId) },
    { glyph: glyphs.indent.glyph, label: 'IN', a11y: 'Indent', onPress: () => actions.indentTask(editingId) },
    { glyph: glyphs.add.glyph, label: 'SUB', a11y: 'Add subtask', onPress: () => actions.addSubtask(editingId) },
  ];
  const detailButtons: ButtonSpec[] = [
    { glyph: glyphs.priority.glyph, label: 'PRI', a11y: 'Change priority', onPress: () => actions.cyclePriority(editingId) },
    field === 'notes'
      ? { glyph: glyphs.notes.glyph, label: 'TITLE', a11y: 'Edit title', onPress: () => actions.setEditing(editingId, null, 'title') }
      : { glyph: glyphs.notes.glyph, label: 'NOTE', a11y: 'Edit notes', onPress: () => actions.setEditing(editingId, null, 'notes') },
  ];
  const buttons: ButtonSpec[] = [
    ...(structure ? structureButtons : []),
    ...detailButtons,
    { glyph: glyphs.notify.glyph, label: 'DUE', a11y: 'Set due date and reminder', onPress: () => actions.openDueSheet(editingId) },
    { glyph: glyphs.undo.glyph, label: 'UNDO', a11y: 'Undo', onPress: () => actions.undo() },
    {
      glyph: glyphs.done.glyph,
      label: 'DONE',
      a11y: 'Done editing',
      // Close the keyboard explicitly: unmounting a focused input doesn't always hide it on Android.
      onPress: () => {
        actions.finishEditing(editingId);
        Keyboard.dismiss();
      },
    },
  ];

  return (
    // Rides on top of the keyboard; shifts down by the safe-area inset while
    // it's open, because the keyboard already covers that strip.
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.sticky}>
      {/* Registered as the "floor": typed text is kept above this bar's top edge. */}
      <View ref={registerFloor} collapsable={false} style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="toolbar">
        {buttons.map((b) => (
          <Pressable
            key={b.label}
            onPress={b.onPress}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={b.a11y}
            // Keep the editor focused: tapping a toolbar button must not blur it.
            focusable={false}
          >
            <Text style={[type.glyph, styles.glyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {b.glyph}
            </Text>
            <Text style={[type.meta, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier} numberOfLines={1}>
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: shape.hairline,
    borderTopColor: colors.line,
  },
  // Equal-width buttons, each at least the 44 pt tap target in both directions.
  button: { flex: 1, minHeight: size.toolbarHeight, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xs },
  pressed: { backgroundColor: colors.surface },
  glyph: { color: colors.accent, ...platformText },
  label: { color: colors.text, ...platformText },
});
