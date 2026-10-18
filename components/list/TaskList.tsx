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
 *
 * Folds (useFoldFocus.ts): a quest opened comes into focus (its title
 * scrolls to the top when its subtasks don't fit below it); one closed
 * stays exactly where it is.
 *
 * Views: every tab switch opens at the top (a fresh list); within a tab,
 * each zoom level keeps its own scroll position. Views slide in from their side
 * (useViewPlace.ts): zooming deeper comes in from the right, zooming out
 * from the left.
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useRef, useState } from 'react';
import Animated from 'react-native-reanimated';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { BlockCursor } from '@/components/common/BlockCursor';
import { Prompted } from '@/components/common/Prompted';
import { EditingChips } from '@/components/edit/EditingChips';

import type { Row } from '@/lib/flatten';
import type { TasksState } from '@/lib/types';
import { CATEGORY_TABS } from '@/lib/quests';
import { findTask } from '@/lib/taskMap';
import { useActions, useAppStore, useSelectors, useStoreBundle } from '@/store/react';
import { colors, glowShadow, glowTextSoft, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { DragOverlay, DragProvider, useDragController } from './drag';
import { GlideCell } from './GlideCell';
import { KeepInViewProvider, useKeepInViewController } from './keepInView';
import { TaskRow } from './TaskRow';
import { useFoldFocus } from './useFoldFocus';
import { useKeyboardHeight } from './useKeyboardHeight';
import { useViewPlace } from './useViewPlace';

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

  // The view shown: a quest tab (opens at the top), and a zoom level within it (keeps its place).
  const category = useAppStore((s) => s.ui.category);
  const zoomRootId = useAppStore((s) => s.ui.zoomRootId);
  const zoomDepth = useAppStore((s) => zoomLevel(s.tasks, s.ui.zoomRootId));
  const shown = useAppStore((s) => s.ui.tab === 'active');
  const place = useViewPlace(list, `${category}/${zoomRootId ?? ''}`, CATEGORY_TABS.indexOf(category) * 100 + zoomDepth, {
    tab: category,
    visible: shown,
  });

  // Scroll to the top (store revealTop): a new quest was added (it sorts first), the
  // selected tab was tapped again, or home. Only while ACTIVE is the tab on screen.
  const { store } = useStoreBundle();
  const revealTop = useAppStore((s) => s.revealTop);
  useEffect(() => {
    if (revealTop > 0 && store.getState().ui.tab === 'active') list.current?.scrollToOffset({ offset: 0, animated: true });
  }, [revealTop, store]);

  const container = useRef<View>(null);
  const keyboardHeight = useKeyboardHeight();
  // The content's bottom room: the quick-add bar's, and while typing the keyboard's and the
  // toolbar's (so even the last row can scroll above them). They float over the list.
  const padBottom = bottomInset + (keyboardHeight ? keyboardHeight + size.toolbarHeight : 0);
  // A quest opened comes into focus; one closed stays where it is (useFoldFocus.ts).
  const fold = useFoldFocus(list, rows, { padBottom, topTuck: DIVIDER_TUCK, coveredBottom: padBottom, shown, viewKey: place.listKey });

  // The quest order is locked while editing (store questOrderLock) and re-sorts when
  // editing ends. If the task just edited moved, follow it so it stays in view.
  const edited = useRef<{ id: string; index: number } | null>(null);
  useEffect(() => {
    if (editingId !== null) {
      edited.current = { id: editingId, index: rows.findIndex((r) => r.id === editingId) };
      return;
    }
    const last = edited.current;
    edited.current = null;
    if (!last) return;
    const index = rows.findIndex((r) => r.id === last.id);
    if (index >= 0 && index !== last.index) list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  }, [editingId, rows]);

  // Keep the text being typed in view (see keepInView.tsx).
  const keepInView = useKeepInViewController(container, list);

  // Drag-and-drop (drag.tsx). Rows are read through a ref: they can change mid-drag
  // when hovering opens a collapsed group. No dragging while editing.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const dragging = useAppStore((s) => s.draggingId !== null);
  // Drag is off while editing, selecting, or searching/filtering (results aren't the real order).
  const searching = useAppStore((s) => s.search.active.query.trim() !== '' || s.search.active.filter !== 'all');
  const selecting = useAppStore((s) => s.selection !== null);
  // Drag goes off and on a frame after editing, selecting or searching starts or ends: every
  // row's drag gesture is rebuilt when it does, and that mustn't hold up the editor (or the
  // selection bar) appearing (responsiveness pass 2026-10-18). A drag can't start in that frame:
  // its start checks those modes itself (drag.tsx).
  const dragAllowed = editingId === null && !selecting && !searching;
  const [dragOn, setDragOn] = useState(dragAllowed);
  useEffect(() => {
    if (dragOn === dragAllowed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setDragOn(dragAllowed), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [dragOn, dragAllowed]);
  const drag = useDragController({ store, list, container, rows: rowsRef, enabled: dragOn });
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
  // The chips above an edited title follow it when the list scrolls (EditingChips.tsx).
  const chipsMeasure = useRef<(() => void) | null>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    place.onScroll(e.nativeEvent.contentOffset.y);
    fold.onScroll(e.nativeEvent.contentOffset.y);
    if (editingId) chipsMeasure.current?.();
    const start = dragStartY.current;
    if (start !== null && Math.abs(e.nativeEvent.contentOffset.y - start) > DISMISS_DRAG_DISTANCE) {
      dragStartY.current = null;
      Keyboard.dismiss(); // the editor's blur ends the editing session
    }
  };

  const renderItem = useCallback(({ item }: { item: Row }) => <TaskRow row={item} />, []);

  return (
    <View ref={container} style={styles.container} collapsable={false}>
      <KeepInViewProvider value={keepInView}>
        <DragProvider value={drag.api}>
          <Animated.View style={[styles.container, styles.clip, place.style]}>
            <FlashList
              // Every quest has a divider above it, the first too: the list starts that far up,
              // under this view's top edge, so the first one isn't seen (the fixed header divider
              // is right above). When the top quest leaves, the next one's divider is already there.
              style={styles.tucked}
              // Cells glide to their new places when a completed quest leaves (GlideCell).
              CellRendererComponent={GlideCell}
              // A fresh list for every tab switch: it always opens at the top (useViewPlace).
              key={place.listKey}
              ref={list}
              data={rows}
              renderItem={renderItem}
              keyExtractor={(r) => r.id}
              // Separate recycling pools: groups, other quests and subtasks differ in layout. The
              // pools also give FlashList its size estimates for rows it hasn't measured yet:
              // subtasks appearing as their quest opens are first placed by their own kind's
              // average, so the glide has (almost) nothing to correct (2026-10-17).
              getItemType={(r) => (r.depth > 0 ? 'sub' : r.hasChildren ? 'group' : 'quest')}
              onViewableItemsChanged={({ viewableItems }) => {
                const indices = viewableItems.map((v) => v.index ?? 0);
                visible.current = indices.length ? { first: Math.min(...indices), last: Math.max(...indices) } : { first: 0, last: -1 };
              }}
              // Taps on rows work while the keyboard is open; taps on empty space dismiss it.
              keyboardShouldPersistTaps="handled"
              // The list stays still while a task is dragged (auto-scroll moves it instead).
              scrollEnabled={!dragging}
              onScrollBeginDrag={onScrollBeginDrag}
              onScrollEndDrag={(e) => {
                dragStartY.current = null;
                fold.onScrollEnd(e);
              }}
              onMomentumScrollEnd={fold.onScrollEnd}
              onLayout={fold.onLayout}
              onContentSizeChange={fold.onContentSizeChange}
              onScroll={onScroll}
              scrollEventThrottle={32}
              // While the keyboard is open, pad by its height (plus the toolbar on it)
              // so even the last row can be scrolled up to just above the toolbar.
              // Plus the fold's slack: the room that keeps a closed quest where it was.
              contentContainerStyle={{ paddingBottom: padBottom + fold.slack }}
              ListEmptyComponent={EmptyState}
            />
          </Animated.View>
          <DragOverlay view={drag.view} api={drag.api} />
          {/* The chips of the title being edited, floating just above the typed line. */}
          <EditingChips container={container} measureRef={chipsMeasure} />
        </DragProvider>
      </KeepInViewProvider>
    </View>
  );
}

/** How deep the zoom is: 0 at a tab's top level, 1 inside a quest, 2 inside one of its subtasks… */
function zoomLevel(tasks: TasksState, zoomRootId: string | null): number {
  let level = 0;
  for (let id = zoomRootId; id !== null; id = findTask(tasks, id)?.parentId ?? null) level++;
  return level;
}

/**
 * Shown when the ACTIVE list has no rows (PLAN §9.19): the terminal prompt
 * with a blinking cursor and, when there are no tasks at all, a button that
 * loads a small example tree. Searching and zooming get their own wording.
 */
function EmptyState() {
  const actions = useActions();
  const selectors = useSelectors();
  const searching = useAppStore((s) => s.search.active.open && (s.search.active.query.trim() !== '' || s.search.active.filter !== 'all'));
  const zoomed = useAppStore((s) => s.ui.zoomRootId !== null);
  // The quest tab shown, and whether there are any open quests at all (example tasks are
  // offered only to a truly empty list, not to an empty DAILY tab).
  const category = useAppStore((s) => s.ui.category);
  const noQuests = useAppStore((s) => selectors.tabCounts(s).all.active === 0);
  if (searching || zoomed) {
    return (
      <View style={styles.empty}>
        <Text style={[type.body, styles.emptyText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          <Prompted>{searching ? 'NO MATCHES.' : 'EMPTY GROUP. TYPE BELOW TO ADD'}</Prompted>
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <Text style={[type.body, styles.emptyText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        <Prompted>{`NO ${category === 'all' ? 'ACTIVE' : category.toUpperCase()} QUESTS. TYPE BELOW TO BEGIN`}</Prompted>
        <BlockCursor />
      </Text>
      {noQuests && (
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
      )}
    </View>
  );
}

/** How far the list starts above its view: one quest divider (TaskRow topLevel: margin + line). */
const DIVIDER_TUCK = space.sm + shape.hairline;

const styles = StyleSheet.create({
  container: { flex: 1 },
  // The list's view clips what's tucked above its top edge.
  clip: { overflow: 'hidden' },
  tucked: { marginTop: -DIVIDER_TUCK },
  // The empty state sits where it did before the tuck.
  empty: { paddingHorizontal: space.lg, paddingTop: space.xl + DIVIDER_TUCK },
  emptyText: { color: colors.textDim, ...platformText },
  example: {
    alignSelf: 'flex-start',
    marginTop: space.xl,
    minHeight: size.hitTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderRadius: shape.radius,
    // The one thing to do on an empty list: a lit frame with the faint glow (aesthetic pass 2026-10-17).
    borderColor: colors.lineLit,
    boxShadow: glowShadow.faint,
  },
  examplePressed: { backgroundColor: colors.surface, borderColor: colors.accent },
  exampleText: { color: colors.accent, ...glowTextSoft, ...platformText },
});
