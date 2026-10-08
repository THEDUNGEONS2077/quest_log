/**
 * components/edit/SelectionBar.tsx: multi-select actions (PLAN §9.14).
 *
 *   3 SELECTED                                   CANCEL
 *   [✓ DONE] [! PRI] [◔ DUE] [↦ MOVE] [⊞ GROUP] [✕ DEL]
 *
 * Layer: UI. Replaces the quick-add bar while selecting, at the bottom of
 * the screen within thumb reach. Selecting a parent includes its subtree.
 * Every action is one undo step. PRI cycles the priority of all selected
 * tasks (starting from the first one's); DUE opens the date sheet for all of them; MOVE opens
 * the Move to… picker; GROUP wraps them in a new group and starts naming it.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/services/haptics';
import { SELECTION } from '@/store/createStore';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

export function SelectionBar() {
  const selection = useAppStore((s) => s.selection);
  const actions = useActions();
  const insets = useSafeAreaInsets();
  if (!selection) return null;

  const buttons = [
    {
      glyph: glyphs.done.glyph,
      label: 'DONE',
      a11y: 'Complete selected',
      onPress: () => {
        haptics.success();
        actions.completeSelection();
      },
    },
    {
      glyph: glyphs.priority.glyph,
      label: 'PRI',
      a11y: 'Set priority of selected',
      onPress: actions.cycleSelectionPriority,
    },
    { glyph: glyphs.notify.glyph, label: 'DUE', a11y: 'Set due date of selected', onPress: () => actions.openDueSheet(SELECTION) },
    { glyph: glyphs.moveTo.glyph, label: 'MOVE', a11y: 'Move selected', onPress: () => actions.openMovePicker(selection) },
    { glyph: glyphs.duplicate.glyph, label: 'GROUP', a11y: 'Group selected into a new task', onPress: () => actions.groupSelection() },
    {
      glyph: glyphs.delete.glyph,
      label: 'DEL',
      a11y: 'Delete selected',
      onPress: () => {
        haptics.delete();
        actions.deleteSelection();
      },
    },
  ];

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="toolbar">
      <View style={styles.head}>
        <Text style={[type.tab, styles.count]} maxFontSizeMultiplier={maxFontSizeMultiplier} accessibilityLiveRegion="polite">
          {`${selection.length} SELECTED`}
        </Text>
        <Pressable onPress={actions.clearSelection} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Cancel selection">
          <Text style={[type.tab, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            CANCEL
          </Text>
        </Pressable>
      </View>
      <View style={styles.buttons}>
        {buttons.map((b) => (
          <Pressable
            key={b.label}
            onPress={b.onPress}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={b.a11y}
          >
            <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {b.glyph}
            </Text>
            <Text style={[type.meta, styles.text]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: shape.hairline,
    borderTopColor: colors.line,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.lg },
  count: { color: colors.accent, ...platformText },
  cancel: { minHeight: size.hitTarget, justifyContent: 'center', paddingHorizontal: space.lg },
  buttons: { flexDirection: 'row' },
  button: { flex: 1, minHeight: size.toolbarHeight, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.surface },
  accent: { color: colors.accent, ...platformText },
  text: { color: colors.text, ...platformText },
});
