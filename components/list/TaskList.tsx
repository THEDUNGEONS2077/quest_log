/**
 * components/list/TaskList.tsx: the ACTIVE task tree as a recycling list
 * (PLAN §9.2, §5 scroll budget).
 *
 * Layer: UI. FlashList renders only the rows on screen and recycles them.
 * Rows come from the memoized `activeRows` selector, which recomputes only
 * on structural changes, never on keystrokes.
 *
 * Keyboard: the scroll view is keyboard-aware, and keeps the edited title
 * just above the editing toolbar, which rides on the keyboard (with room for
 * the chips row under the title). A row that starts editing off-screen (a new
 * subtask at the end of a long group) is scrolled into view first, so its
 * editor can mount and take focus. Dragging the list a meaningful distance
 * ends editing (PLAN §9.3).
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { type ComponentProps, useCallback, useEffect, useRef } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import type { Row } from '@/lib/flatten';
import { useAppStore, useSelectors } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, size, space, type } from '@/theme';

import { TaskRow } from './TaskRow';

/** Dragging the list this far (pt) while editing closes the keyboard. */
const DISMISS_DRAG_DISTANCE = size.rowMinHeight * 3;

/**
 * Gap kept between the keyboard and the edited title's caret: the toolbar
 * (which sits on the keyboard) plus one chips row and a margin.
 */
const CARET_CLEARANCE = size.toolbarHeight + size.hitTarget + space.lg;

/** The keyboard-aware scroll view with this list's caret clearance. */
function ScrollView(props: ComponentProps<typeof KeyboardAwareScrollView>) {
  return <KeyboardAwareScrollView {...props} bottomOffset={CARET_CLEARANCE} />;
}

interface Props {
  /** Space reserved at the bottom for the quick-add bar. */
  bottomInset: number;
}

export function TaskList({ bottomInset }: Props) {
  const selectors = useSelectors();
  const rows = useAppStore((s) => selectors.activeRows(s));
  const editingId = useAppStore((s) => s.editingId);
  const highlightId = useAppStore((s) => s.highlightId);
  const list = useRef<FlashListRef<Row>>(null);
  // Index range currently on screen, from FlashList's viewability callback.
  const visible = useRef({ first: 0, last: -1 });

  // When editing starts on a row that isn't on screen, or a task is opened
  // from a notification/link, scroll it into view (FlashList only mounts
  // visible rows, so an editor couldn't otherwise focus).
  const target = editingId ?? highlightId;
  useEffect(() => {
    if (!target) return;
    const index = rows.findIndex((r) => r.id === target);
    if (index < 0) return;
    const { first, last } = visible.current;
    if (index < first || index > last) list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  }, [target, rows]);

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
      ref={list}
      data={rows}
      renderItem={renderItem}
      keyExtractor={(r) => r.id}
      // Separate recycling pools: group headers and plain rows differ in layout.
      getItemType={(r) => (r.depth === 0 && r.hasChildren ? 'group' : 'task')}
      renderScrollComponent={ScrollView}
      onViewableItemsChanged={({ viewableItems }) => {
        const indices = viewableItems.map((v) => v.index ?? 0);
        visible.current = indices.length ? { first: Math.min(...indices), last: Math.max(...indices) } : { first: 0, last: -1 };
      }}
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
