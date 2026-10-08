/**
 * components/common/SearchBar.tsx: search and filter chips (PLAN §9.11).
 *
 *   > /cafe█                      ✕
 *   [ ALL ][ !!! ][ DUE ][ OVERDUE ][ ↻ ]     (ACTIVE tab only)
 *
 * Layer: UI. Opened by the `/` button in the header. Each tab keeps its own
 * search. Typing is debounced (120 ms) before the list updates, so a long
 * list doesn't re-filter on every keystroke. ✕ (or Android back) closes
 * search and clears it. While searching, drag-and-drop is off.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Filter } from '@/lib/search';
import { useActions, useAppStore } from '@/store/react';
import type { Tab } from '@/store/uiState';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** Debounce between typing and filtering (PLAN §9.11). */
const DEBOUNCE_MS = 120;

const FILTERS: { key: Filter; label: string; a11y: string }[] = [
  { key: 'all', label: 'ALL', a11y: 'All tasks' },
  { key: 'high', label: '!!!', a11y: 'High priority' },
  { key: 'due', label: 'DUE', a11y: 'Has a due date' },
  { key: 'overdue', label: 'OVERDUE', a11y: 'Overdue' },
  { key: 'repeat', label: glyphs.repeat.glyph, a11y: 'Repeating' },
];

export function SearchBar({ tab }: { tab: Tab }) {
  const search = useAppStore((s) => s.search[tab]);
  const actions = useActions();
  // Local text for instant typing; the store (and the list) follow after the debounce.
  const [text, setText] = useState(search.query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onChange = (next: string) => {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => actions.setSearch(tab, { query: next }), DEBOUNCE_MS);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {glyphs.search.glyph}
        </Text>
        <TextInput
          value={text}
          onChangeText={onChange}
          autoFocus
          placeholder={tab === 'active' ? 'search tasks and notes' : 'search completed'}
          placeholderTextColor={colors.textDim}
          cursorColor={colors.accent}
          selectionColor={colors.accent}
          returnKeyType="search"
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          style={[type.body, styles.input]}
          accessibilityLabel={tab === 'active' ? 'Search tasks' : 'Search completed tasks'}
        />
        <Pressable
          onPress={() => actions.closeSearch(tab)}
          hitSlop={space.md}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close search"
        >
          <Text style={[type.glyph, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {glyphs.delete.glyph}
          </Text>
        </Pressable>
      </View>

      {/* Filter chips: ACTIVE only (the COMPLETED tab is all done anyway). */}
      {tab === 'active' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {FILTERS.map((f) => {
            const on = search.filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => actions.setSearch(tab, { filter: f.key })}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={f.a11y}
              >
                <Text style={[type.tab, on ? styles.accent : styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: size.hitTarget,
    paddingHorizontal: space.md,
    borderWidth: shape.hairline,
    borderColor: colors.accent,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, color: colors.text, padding: 0, ...platformText },
  close: { minWidth: size.hitTarget - space.md, alignItems: 'center' },
  chips: { gap: space.sm, paddingTop: space.sm },
  chip: {
    minHeight: size.hitTarget,
    minWidth: size.hitTarget,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surface },
  accent: { color: colors.accent, ...platformText },
  text: { color: colors.text, ...platformText },
});
