/**
 * components/overlays/MovePicker.tsx: Move to… (PLAN §9.15).
 *
 *   > MOVE "Ship v2 build" TO…
 *   [ search ]
 *   ↦ TOP LEVEL
 *   WORK
 *     Release notes
 *   HOME            (dimmed when it's the task itself or inside it)
 *
 * Layer: UI. Lists the ACTIVE tree, fully expanded and indented, with a
 * search field. Choosing a destination moves the task(s), with their
 * subtrees, to the end of it (one undo step). A task's own subtree can't be
 * chosen. Opened from the long-press menu or the multi-select MOVE button;
 * the store's `movePickerFor` holds which tasks.
 */
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAfterKeyboardCloses } from '@/components/common/keyboard';

import { normalize } from '@/lib/search';
import { findTask } from '@/lib/taskMap';
import { shownTitle } from '@/lib/title';
import { childIds, isInSubtree } from '@/lib/tree';
import type { ID, TasksState } from '@/lib/types';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

interface Dest {
  id: ID;
  title: string;
  depth: number;
  /** The task being moved, or inside it: not a valid destination. */
  disabled: boolean;
}

/** Every live open task in tree order (collapsed groups included), marking invalid destinations. */
function destinations(tasks: TasksState, moving: readonly ID[]): Dest[] {
  const out: Dest[] = [];
  const walk = (parent: ID | null, depth: number) => {
    for (const id of childIds(tasks, parent)) {
      const t = findTask(tasks, id);
      if (!t || t.deletedAt !== null || (depth === 0 && t.done)) continue;
      out.push({ id, title: shownTitle(t) || 'Untitled task', depth, disabled: moving.some((m) => isInSubtree(tasks, id, m)) });
      walk(id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function MovePicker() {
  const moving = useAppStore((s) => s.movePickerFor);
  return moving ? <MovePickerBody moving={moving} /> : null;
}

function MovePickerBody({ moving }: { moving: ID[] }) {
  const tasks = useAppStore((s) => s.tasks);
  const actions = useActions();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const all = useMemo(() => destinations(tasks, moving), [tasks, moving]);
  const q = normalize(query.trim());
  const shown = q ? all.filter((d) => normalize(d.title).includes(q)) : all;

  const what =
    moving.length === 1
      ? `"${shownTitle(findTask(tasks, moving[0]!) ?? { title: '', parentId: null }) || 'task'}"`
      : `${moving.length} TASKS`;

  // Opens once the keyboard is closed (see useAfterKeyboardCloses).
  const ready = useAfterKeyboardCloses(true);

  return (
    <Modal
      visible={ready}
      transparent
      animationType="fade"
      onRequestClose={actions.closeMovePicker}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.sheet, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom }]}>
        <View style={styles.head}>
          <Text style={[type.body, styles.title]} numberOfLines={2} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.prompt.glyph} MOVE ${what} TO…`}
          </Text>
          <Pressable onPress={actions.closeMovePicker} style={styles.close} accessibilityRole="button" accessibilityLabel="Cancel move">
            <Text style={[type.glyph, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {glyphs.delete.glyph}
            </Text>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="search destinations"
          placeholderTextColor={colors.textDim}
          cursorColor={colors.accent}
          selectionColor={colors.accent}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          style={[type.body, styles.search]}
          accessibilityLabel="Search destinations"
        />
        <FlashList
          data={shown}
          keyExtractor={(d) => d.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<Option label={`${glyphs.moveTo.glyph} TOP LEVEL`} depth={0} onPress={() => actions.moveTo(moving, null)} />}
          renderItem={({ item }) => (
            <Option
              label={item.title}
              depth={q ? 0 : item.depth}
              disabled={item.disabled}
              onPress={() => actions.moveTo(moving, item.id)}
            />
          )}
        />
      </View>
    </Modal>
  );
}

/** One destination row (indented by depth; dimmed and inert when invalid). */
function Option({ label, depth, disabled, onPress }: { label: string; depth: number; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.option,
        { paddingLeft: space.lg + Math.min(depth, size.maxVisualDepth) * size.indent },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={disabled ? `${label}, can't move here` : `Move to ${label}`}
    >
      <Text
        style={[depth === 0 ? type.group : type.subtask, disabled ? styles.disabled : depth === 0 ? styles.bright : styles.text]}
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md },
  title: { flex: 1, color: colors.accent, ...platformText },
  // Framed like every other screen's close button.
  close: {
    width: size.hitTarget,
    height: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  search: {
    color: colors.text,
    marginHorizontal: space.lg,
    marginVertical: space.md,
    minHeight: size.hitTarget,
    paddingHorizontal: space.md,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
    ...platformText,
  },
  option: {
    minHeight: size.rowMinHeight,
    justifyContent: 'center',
    paddingRight: space.lg,
    borderBottomWidth: shape.hairline,
    borderBottomColor: colors.line,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  // Still readable (dim), clearly different from the bright/normal destinations.
  disabled: { color: colors.textDim, ...platformText },
});
