/**
 * lib/dnd.ts: where a dragged task lands (PLAN §9.10).
 *
 * Layer: pure lib. The drag UI reports the finger's vertical position (in
 * list content coordinates) and how far it has moved sideways; this module
 * answers "which gap, at which depth", and then "which parent, at which
 * index". The UI draws the drop indicator from the first answer and
 * dispatches a `move` op from the second.
 *
 * While dragging, the task's subtree travels with it, so the rows passed
 * in here exclude the dragged task and its descendants. Dropping into its
 * own subtree is therefore impossible by construction.
 *
 * Depth rule: between rows A (above) and B (below), a dropped task can sit
 * anywhere from B's depth (beside B) up to A's depth + 1 (as A's child).
 * Horizontal movement picks within that range, one level per indent step.
 */
import { moveTask, type Op } from './ops';
import { childIds, getTask } from './tree';
import type { ID, TasksState } from './types';

/** A visible row during a drag: its depth and vertical extent in content coordinates. */
export interface DragRow {
  id: ID;
  depth: number;
  top: number;
  height: number;
}

/** A drop position: insert before `rows[gap]` (gap = rows.length means at the end), at `depth`. */
export interface DropTarget {
  gap: number;
  depth: number;
}

/** The depths allowed in gap `gap` (see the file header). */
export function depthRange(rows: readonly DragRow[], gap: number): { min: number; max: number } {
  const above = rows[gap - 1];
  const below = rows[gap];
  const max = above ? above.depth + 1 : 0;
  const min = below ? Math.min(below.depth, max) : 0;
  return { min, max };
}

/**
 * The drop target for a finger at content-y `y`, after moving `dx` points
 * sideways from a task that started at depth `startDepth`.
 */
export function dropTarget(rows: readonly DragRow[], y: number, startDepth: number, dx: number, indent: number): DropTarget {
  // The gap: before the first row whose middle is below the finger.
  let gap = rows.findIndex((r) => y < r.top + r.height / 2);
  if (gap < 0) gap = rows.length;
  const { min, max } = depthRange(rows, gap);
  const wanted = startDepth + Math.round(dx / indent);
  return { gap, depth: Math.max(min, Math.min(max, wanted)) };
}

/**
 * The parent and child index a drop target means. `rootId` is the list's
 * root (null, or the zoomed-in task). `draggedId` is excluded when
 * counting positions, because `move` indices are counted without the task.
 */
export function resolveDrop(
  state: TasksState,
  rows: readonly DragRow[],
  target: DropTarget,
  draggedId: ID,
  rootId: ID | null,
): { parentId: ID | null; index: number } {
  const { gap, depth } = target;
  // The parent: the nearest row above the gap at depth - 1 (or the list root for depth 0).
  let parentId: ID | null = rootId;
  if (depth > 0) {
    for (let i = gap - 1; i >= 0; i--) {
      if (rows[i]!.depth === depth - 1) {
        parentId = rows[i]!.id;
        break;
      }
    }
  }
  // The index: right after the nearest sibling above the gap (between the gap and the parent).
  const siblings = childIds(state, parentId).filter((c) => c !== draggedId);
  for (let i = gap - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.depth < depth) break; // reached the parent: no sibling above, so first child
    if (r.depth === depth) {
      const at = siblings.indexOf(r.id);
      if (at >= 0) return { parentId, index: at + 1 };
    }
  }
  return { parentId, index: 0 };
}

/**
 * The move op for a drop, or null when it would leave the task where it
 * already is (a no-op drag adds nothing to undo history).
 */
export function dropOp(
  state: TasksState,
  rows: readonly DragRow[],
  target: DropTarget,
  draggedId: ID,
  rootId: ID | null,
  at: number,
): Op | null {
  const { parentId, index } = resolveDrop(state, rows, target, draggedId, rootId);
  const task = getTask(state, draggedId);
  // Same parent and same position (counted without the task, like `index`): nothing to do.
  if (task.parentId === parentId && childIds(state, parentId).indexOf(draggedId) === index) return null;
  return moveTask(state, draggedId, parentId, index, at);
}

/**
 * Accessibility "Move up" / "Move down" (PLAN §9.10): swap with the
 * previous / next live sibling. Returns null at either end.
 */
export function moveBy(state: TasksState, id: ID, delta: -1 | 1, at: number, isLive: (id: ID) => boolean): Op | null {
  const parentId = getTask(state, id).parentId;
  const list = childIds(state, parentId);
  const live = list.filter(isLive);
  const i = live.indexOf(id);
  const neighbour = live[i + delta];
  if (neighbour === undefined) return null;
  // Index counted without the task itself, as `move` expects.
  const without = list.filter((c) => c !== id);
  const index = without.indexOf(neighbour) + (delta > 0 ? 1 : 0);
  return moveTask(state, id, parentId, index, at);
}
