/**
 * components/list/TaskList.tsx: the ACTIVE task tree as a recycling list
 * (PLAN §9.2, §5 scroll budget).
 *
 * Layer: UI. FlashList renders only the rows on screen and recycles them.
 * Rows come from the memoized `activeRows` selector, which recomputes only
 * on structural changes, never on keystrokes.
 *
 * Keyboard: the scroll view is keyboard-aware, so a row that starts
 * editing is scrolled above the keyboard and the quick-add bar. Dragging
 * the list a meaningful distance ends editing (PLAN §9.3).
 */
import { FlashList } from '@shopify/flash-list';
import { useCallback, useRef } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import type { Row } from '@/lib/flatten';
import { useAppStore, useSelectors } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, size, space, type } from '@/theme';

import { TaskRow } from './TaskRow';

/** Dragging the list this far (pt) while editing closes the keyboard. */
const DISMISS_DRAG_DISTANCE = size.rowMinHeight * 3;

interface Props {
  /** Space reserved at the bottom for the quick-add bar. */
  bottomInset: number;
}

export function TaskList({ bottomInset }: Props) {
  const selectors = useSelectors();
  const rows = useAppStore((s) => selectors.activeRows(s));

  // Track the drag start so only a deliberate scroll ends editing, not a nudge.
  const dragStartY = useRef<number | null>(null);
  const onScrollBeginDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragStartY.current = e.nativeEvent.contentOffset.y;
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const start = dragStartY.current;
    if (start !== null && Math.abs(e.nativeEvent.contentOffset.y - start) > DISMISS_DRAG_DISTANCE) {
      dragStartY.current = null;
      Keyboard.dismiss(); // the editor's blur ends the editing session
    }
  };

  const renderItem = useCallback(({ item }: { item: Row }) => <TaskRow row={item} />, []);

  return (
    <FlashList
      data={rows}
      renderItem={renderItem}
      keyExtractor={(r) => r.id}
      // Separate recycling pools: group headers and plain rows differ in layout.
      getItemType={(r) => (r.depth === 0 && r.hasChildren ? 'group' : 'task')}
      renderScrollComponent={KeyboardAwareScrollView}
      // Taps on rows work while the keyboard is open; taps on empty space dismiss it.
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={() => (dragStartY.current = null)}
      onScroll={onScroll}
      scrollEventThrottle={32}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      ListEmptyComponent={EmptyState}
    />
  );
}

/** Shown when there are no active tasks (PLAN §9.19). */
function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={[type.body, styles.emptyText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${glyphs.prompt.glyph} NO ACTIVE QUESTS. TYPE BELOW TO BEGIN${glyphs.cursor.glyph}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: space.lg, paddingTop: space.xl },
  emptyText: { color: colors.textDim, ...platformText },
});
