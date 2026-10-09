/**
 * components/list/drag.tsx: drag-and-drop to reorder and re-nest (PLAN §9.10).
 *
 * Layer: UI. Three parts:
 *   - useDragController (used by TaskList): owns one drag session. It reads
 *     row positions from FlashList's getLayout, asks lib/dnd.ts for the drop
 *     target as the finger moves, auto-scrolls near the edges, opens a
 *     collapsed group after 600 ms of hovering, and dispatches one undoable
 *     `move` on release.
 *   - useRowDragGesture (used by TaskRow): long-press 300 ms, then pan.
 *     Releasing without moving opens the row's menu instead (PLAN §6.5).
 *   - DragOverlay: the lifted copy of the row (follows the finger on the UI
 *     thread) and the 2 pt accent drop indicator at the target's depth.
 *
 * Rows don't slide aside while dragging (the indicator line shows the
 * landing spot); the dragged task and its subtree are dimmed and can't be
 * targets, so dropping a task into itself is impossible.
 */
import type { FlashListRef } from '@shopify/flash-list';
import { createContext, type RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, type View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { type DragRow, dropOp, dropTarget, type DropTarget } from '@/lib/dnd';
import type { Row } from '@/lib/flatten';
import { findTask } from '@/lib/taskMap';
import { shownTitle } from '@/lib/title';
import { subtreeIds } from '@/lib/tree';
import { haptics } from '@/services/haptics';
import type { AppStoreInstance } from '@/store/createStore';
import { colors, focusGlow, glowShadow, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, timing, type } from '@/theme';

/** The lifted row's scale (PLAN §9.10: slight lift). */
const LIFT_SCALE = 1.02;
/** Moving less than this (pt) between lift and release counts as a long-press, not a drag. */
const TAP_SLOP = 8;
/** Distance from the list's top/bottom edge where auto-scroll kicks in. */
const EDGE = size.rowMinHeight * 1.5;
/** Fastest auto-scroll speed, in pt per frame, at the very edge. */
const MAX_SCROLL_STEP = 18;

/** What the overlay shows while dragging (React state: changes only on lift/drop/target change). */
export interface DragView {
  title: string;
  /** Subtasks travelling with it (the "+N" badge). */
  count: number;
  /** Drop indicator: y within the list container, and depth. */
  indicator: { y: number; depth: number } | null;
}

interface Session {
  id: string;
  startDepth: number;
  rows: DragRow[];
  containerTop: number;
  startY: number;
  absY: number;
  dx: number;
  moved: boolean;
  target: DropTarget | null;
  hover: { id: string; timer: ReturnType<typeof setTimeout> } | null;
  scroll: ReturnType<typeof setInterval> | null;
}

/** Callbacks the row gesture calls (on the JS thread). */
export interface DragApi {
  start(id: string, absY: number): void;
  move(absY: number, dx: number): void;
  end(): void;
  /** Finger position within the list container, for the lifted row (UI thread). */
  y: SharedValue<number>;
  /** The container's top in window coordinates (UI thread copy). */
  top: SharedValue<number>;
  enabled: boolean;
}

const DragContext = createContext<DragApi | null>(null);
export const DragProvider = DragContext.Provider;

interface ControllerArgs {
  store: AppStoreInstance;
  list: RefObject<FlashListRef<Row> | null>;
  container: RefObject<View | null>;
  /** The current rows (read through a ref: they change while dragging when a group opens). */
  rows: RefObject<Row[]>;
  /** Off while editing (and, from Phase 10, while searching or filtering). */
  enabled: boolean;
}

export function useDragController({ store, list, container, rows, enabled }: ControllerArgs) {
  const y = useSharedValue(0);
  const top = useSharedValue(0);
  const session = useRef<Session | null>(null);
  const [view, setView] = useState<DragView | null>(null);

  /** Row positions from FlashList, minus the dragged task and its subtree. */
  const measureRows = useCallback(
    (draggedId: string): DragRow[] => {
      const hidden = new Set(subtreeIds(store.getState().tasks, draggedId));
      const out: DragRow[] = [];
      rows.current.forEach((r, i) => {
        if (hidden.has(r.id)) return;
        const layout = list.current?.getLayout(i);
        if (layout) out.push({ id: r.id, depth: r.depth, top: layout.y, height: layout.height });
      });
      return out;
    },
    [store, list, rows],
  );

  // The latest `recompute`, for the hover timer (which fires later and must not
  // capture a stale version, nor reference the callback before it's declared).
  const recomputeRef = useRef<() => void>(() => {});

  /**
   * Hover-to-expand (PLAN §9.10): if the gap's row above is a collapsed
   * group and the target stays put for 600 ms, open it, then re-measure.
   */
  const armHover = useCallback(
    (target: DropTarget) => {
      const s = session.current;
      if (!s) return;
      const above = s.rows[target.gap - 1];
      if (s.hover && s.hover.id === above?.id) return;
      if (s.hover) clearTimeout(s.hover.timer);
      s.hover = null;
      const task = above ? findTask(store.getState().tasks, above.id) : undefined;
      if (!above || !task?.collapsed || !store.getState().tasks.children[above.id]?.length) return;
      s.hover = {
        id: above.id,
        timer: setTimeout(() => {
          // Opening the group is navigation, not an undo step.
          store.getState().dispatch({ type: 'update', changes: [{ id: above.id, fields: { collapsed: false } }] }, { undoable: false });
          // Re-measure once the opened rows have rendered.
          setTimeout(() => {
            const cur = session.current;
            if (!cur) return;
            cur.rows = measureRows(cur.id);
            cur.target = null;
            cur.hover = null;
            recomputeRef.current();
          }, 60);
        }, timing.hoverExpand),
      };
    },
    [store, measureRows],
  );

  /** Recomputes the target from the last finger position (after moves and scrolls). */
  const recompute = useCallback(() => {
    const s = session.current;
    if (!s || !list.current) return;
    const offset = list.current.getAbsoluteLastScrollOffset();
    const contentY = s.absY - s.containerTop + offset;
    const t = dropTarget(s.rows, contentY, s.startDepth, s.dx, size.indent);
    if (s.target && t.gap === s.target.gap && t.depth === s.target.depth) return;
    s.target = t;
    if (s.moved) haptics.tick();
    // Indicator: the top of the row at the gap (or the bottom of the last row), on screen.
    const at = s.rows[t.gap];
    const last = s.rows[s.rows.length - 1];
    const gapY = at ? at.top : last ? last.top + last.height : 0;
    setView((v) => (v ? { ...v, indicator: { y: gapY - offset, depth: t.depth } } : v));
    armHover(t);
  }, [list, armHover]);
  useEffect(() => {
    recomputeRef.current = recompute;
  }, [recompute]);

  /** Starts or stops auto-scrolling depending on how close the finger is to an edge. */
  const autoScroll = useCallback(() => {
    const s = session.current;
    if (!s) return;
    container.current?.measureInWindow((_x, cy, _w, ch) => {
      const cur = session.current;
      if (!cur) return;
      const fromTop = cur.absY - cy;
      const fromBottom = cy + ch - cur.absY;
      const speed = fromTop < EDGE ? -((EDGE - fromTop) / EDGE) : fromBottom < EDGE ? (EDGE - fromBottom) / EDGE : 0;
      if (speed === 0) {
        if (cur.scroll) clearInterval(cur.scroll);
        cur.scroll = null;
        return;
      }
      if (cur.scroll) clearInterval(cur.scroll);
      cur.scroll = setInterval(() => {
        const l = list.current;
        if (!l) return;
        const offset = l.getAbsoluteLastScrollOffset();
        l.scrollToOffset({ offset: Math.max(0, offset + speed * MAX_SCROLL_STEP), animated: false });
        recompute();
      }, 16);
    });
  }, [container, list, recompute]);

  const cleanup = useCallback(() => {
    const s = session.current;
    if (s?.hover) clearTimeout(s.hover.timer);
    if (s?.scroll) clearInterval(s.scroll);
    session.current = null;
    setView(null);
    store.getState().setDragging(null);
  }, [store]);

  const api = useMemo<DragApi>(
    () => ({
      y,
      top,
      enabled,
      start(id, absY) {
        const state = store.getState();
        const task = findTask(state.tasks, id);
        if (!task || state.editingId) return;
        const row = rows.current.find((r) => r.id === id);
        if (!row) return;
        session.current = {
          id,
          startDepth: row.depth,
          rows: measureRows(id),
          containerTop: top.get(),
          startY: absY,
          absY,
          dx: 0,
          moved: false,
          target: null,
          hover: null,
          scroll: null,
        };
        // Keep the container's window position exact for this drag.
        container.current?.measureInWindow((_x, cy) => {
          top.set(cy);
          if (session.current) session.current.containerTop = cy;
        });
        haptics.tick();
        state.setDragging(id);
        setView({ title: shownTitle(task) || 'Untitled task', count: subtreeIds(state.tasks, id).length - 1, indicator: null });
      },
      move(absY, dx) {
        const s = session.current;
        if (!s) return;
        s.absY = absY;
        s.dx = dx;
        if (!s.moved && (Math.abs(absY - s.startY) > TAP_SLOP || Math.abs(dx) > TAP_SLOP)) s.moved = true;
        if (!s.moved) return;
        recompute();
        autoScroll();
      },
      end() {
        const s = session.current;
        if (!s) return;
        const { id, moved, target, rows: dragRows } = s;
        cleanup();
        // Held without moving: that's a long-press, so open the menu (PLAN §9.10 step 2).
        if (!moved) {
          store.getState().openMenu(id);
          return;
        }
        if (!target) return;
        const state = store.getState();
        const op = dropOp(state.tasks, dragRows, target, id, state.ui.zoomRootId, Date.now());
        if (!op) return;
        state.dispatch(op);
        haptics.tick();
        state.showToast('MOVED', true);
      },
    }),
    [y, top, enabled, store, rows, measureRows, container, recompute, autoScroll, cleanup],
  );

  return { api, view };
}

/** The row's drag gesture: long-press 300 ms, then pan (or release → menu). */
export function useRowDragGesture(id: string) {
  const api = useContext(DragContext);
  return useMemo(() => {
    if (!api) return null;
    const { start, move, end, y, top } = api;
    return Gesture.Pan()
      .enabled(api.enabled)
      .activateAfterLongPress(timing.longPress)
      .onStart((e) => {
        y.set(e.absoluteY - top.get());
        scheduleOnRN(start, id, e.absoluteY);
      })
      .onUpdate((e) => {
        y.set(e.absoluteY - top.get());
        scheduleOnRN(move, e.absoluteY, e.translationX);
      })
      .onFinalize(() => {
        scheduleOnRN(end);
      });
  }, [api, id]);
}

/** The lifted row and the drop indicator, drawn over the list. */
export function DragOverlay({ view, api }: { view: DragView | null; api: DragApi }) {
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: api.y.get() - size.rowMinHeight / 2 }, { scale: LIFT_SCALE }] }));
  if (!view) return null;
  return (
    <>
      {view.indicator && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              top: view.indicator.y - shape.dropIndicator / 2,
              left: space.lg + Math.min(view.indicator.depth, size.maxVisualDepth) * size.indent,
            },
          ]}
        />
      )}
      <Animated.View pointerEvents="none" style={[styles.lifted, lifted]}>
        <Text style={[type.glyph, styles.handle]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {glyphs.dragHandle.glyph}
        </Text>
        <Text style={[type.body, styles.title]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {view.title}
        </Text>
        {view.count > 0 && (
          <Text style={[type.meta, styles.badge]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`+${view.count}`}
          </Text>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  indicator: { position: 'absolute', right: space.lg, height: shape.dropIndicator, backgroundColor: colors.accent },
  lifted: {
    position: 'absolute',
    top: 0,
    left: space.sm,
    right: space.sm,
    minHeight: size.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: shape.hairline,
    borderColor: colors.accent,
    borderRadius: shape.radius,
    ...focusGlow,
    // Android draws box-shadows (the shadow* props in focusGlow are iOS-only).
    boxShadow: glowShadow.outset,
    elevation: shape.liftElevation,
  },
  handle: { color: colors.accent, ...platformText },
  title: { flex: 1, color: colors.textBright, ...platformText },
  badge: { color: colors.accent, ...platformText },
});
