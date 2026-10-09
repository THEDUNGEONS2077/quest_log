/**
 * components/list/TaskList.tsx: the ACTIVE task tree as a recycling list
 * (PLAN §9.2, §5 scroll budget).
 *
 * Layer: UI. FlashList renders only the rows on screen and recycles them.
 * Rows come from the memoized `activeRows` selector, which recomputes only
 * on structural changes, never on keystrokes.
 *
 * Keyboard: whatever is being typed stays in view (keepInView.tsx): the
 * focused text box is measured against the editing toolbar and the list
 * scrolls by exactly the difference, on focus, when the keyboard opens, and
 * as the text grows. While the keyboard is open the content gets extra
 * bottom padding, so even the last row can scroll above it. A row that
 * starts editing off-screen (a new subtask at the end of a long group) is
 * scrolled to first, so its editor can mount and take focus. Dragging the
 * list a meaningful distance ends editing (PLAN §9.3).
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { BlockCursor } from '@/components/common/BlockCursor';

import type { Row } from '@/lib/flatten';
import { useActions, useAppStore, useSelectors, useStoreBundle } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { DragOverlay, DragProvider, useDragController } from './drag';
import { KeepInViewProvider, useKeepInViewController } from './keepInView';
import { TaskRow } from './TaskRow';
import { useKeyboardHeight } from './useKeyboardHeight';

/** Dragging the list this far (pt) while editing closes the keyboard. */
const DISMISS_DRAG_DISTANCE = size.rowMinHeight * 3;

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
  const container = useRef<View>(null);
  const keyboardHeight = useKeyboardHeight();

  // Keep the text being typed in view (see keepInView.tsx).
  const keepInView = useKeepInViewController(container, list);

  // Drag-and-drop (drag.tsx). Rows are read through a ref: they can change mid-drag
  // when hovering opens a collapsed group. No dragging while editing.
  const { store } = useStoreBundle();
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const dragging = useAppStore((s) => s.draggingId !== null);
  // Drag is off while editing, selecting, or searching/filtering (results aren't the real order).
  const searching = useAppStore((s) => s.search.active.query.trim() !== '' || s.search.active.filter !== 'all');
  const selecting = useAppStore((s) => s.selection !== null);
  const drag = useDragController({ store, list, container, rows: rowsRef, enabled: editingId === null && !selecting && !searching });
  // The keyboard finished opening: re-check the edited row against its final position.
  useEffect(() => {
    if (keyboardHeight > 0 && editingId) keepInView.ensure();
  }, [keyboardHeight, editingId, keepInView]);
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

  // The first row skips its top divider: the fixed header divider is right above it.
  const renderItem = useCallback(({ item, index }: { item: Row; index: number }) => <TaskRow row={item} first={index === 0} />, []);

  return (
    <View ref={container} style={styles.container} collapsable={false}>
      <KeepInViewProvider value={keepInView}>
        <DragProvider value={drag.api}>
          <FlashList
            ref={list}
            data={rows}
            renderItem={renderItem}
            keyExtractor={(r) => r.id}
            // Separate recycling pools: group headers and plain rows differ in layout.
            getItemType={(r) => (r.depth === 0 && r.hasChildren ? 'group' : 'task')}
            onViewableItemsChanged={({ viewableItems }) => {
              const indices = viewableItems.map((v) => v.index ?? 0);
              visible.current = indices.length ? { first: Math.min(...indices), last: Math.max(...indices) } : { first: 0, last: -1 };
            }}
            // Taps on rows work while the keyboard is open; taps on empty space dismiss it.
            keyboardShouldPersistTaps="handled"
            // The list stays still while a task is dragged (auto-scroll moves it instead).
            scrollEnabled={!dragging}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={() => (dragStartY.current = null)}
            onScroll={onScroll}
            scrollEventThrottle={32}
            // While the keyboard is open, pad by its height (plus the toolbar on it)
            // so even the last row can be scrolled up to just above the toolbar.
            contentContainerStyle={{ paddingBottom: bottomInset + (keyboardHeight ? keyboardHeight + size.toolbarHeight : 0) }}
            ListEmptyComponent={EmptyState}
          />
          <DragOverlay view={drag.view} api={drag.api} />
        </DragProvider>
      </KeepInViewProvider>
    </View>
  );
}

/**
 * Shown when the ACTIVE list has no rows (PLAN §9.19): the terminal prompt
 * with a blinking cursor and, when there are no tasks at all, a button that
 * loads a small example tree. Searching and zooming get their own wording.
 */
function EmptyState() {
  const actions = useActions();
  const searching = useAppStore((s) => s.search.active.open && (s.search.active.query.trim() !== '' || s.search.active.filter !== 'all'));
  const zoomed = useAppStore((s) => s.ui.zoomRootId !== null);
  if (searching || zoomed) {
    return (
      <View style={styles.empty}>
        <Text style={[type.body, styles.emptyText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {searching ? `${glyphs.prompt.glyph} NO MATCHES.` : `${glyphs.prompt.glyph} EMPTY GROUP. TYPE BELOW TO ADD`}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <Text style={[type.body, styles.emptyText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${glyphs.prompt.glyph} NO ACTIVE QUESTS. TYPE BELOW TO BEGIN`}
        <BlockCursor />
      </Text>
      <Pressable
        onPress={actions.loadExampleTasks}
        style={({ pressed }) => [styles.example, pressed && styles.examplePressed]}
        accessibilityRole="button"
        accessibilityLabel="Load example tasks"
        accessibilityHint="Adds a few tasks that show how the app works. You can undo it."
      >
        <Text style={[type.tab, styles.exampleText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          [ LOAD EXAMPLE TASKS ]
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { paddingHorizontal: space.lg, paddingTop: space.xl },
  emptyText: { color: colors.textDim, ...platformText },
  example: {
    alignSelf: 'flex-start',
    marginTop: space.xl,
    minHeight: size.hitTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  examplePressed: { backgroundColor: colors.surface },
  exampleText: { color: colors.accent, ...platformText },
});
