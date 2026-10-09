/**
 * lib/flatten.ts: turns the task tree into the flat row lists the two tabs
 * render (PLAN §7.2).
 *
 * Layer: pure lib. The store memoizes these on `structureVersion`, so they
 * run once per structural change, never per keystroke or per render.
 * Search and filter options are added in Phase 10.
 */
import { type CategoryTab, onTab } from './quests';
import { findTask } from './taskMap';
import { childIds } from './tree';
import { type ID, ROOT, type Task, type TasksState } from './types';

/** One visible row in a list. */
export interface Row {
  id: ID;
  /** Depth relative to the list's root (0 = top of the list). */
  depth: number;
  /** Has at least one non-deleted child (shows a caret). */
  hasChildren: boolean;
  /** Direct live children: how many are done out of the total (shows `[done/total]`). */
  progress: { done: number; total: number };
}

/** Options for the ACTIVE list. */
export interface ActiveOptions {
  /** Zoom (focus mode): list only this task's subtree, not including the task itself. */
  zoomRootId?: ID | null;
  /**
   * Done top-level tasks to keep showing for now: a just-checked task stays
   * on ACTIVE while its strikethrough plays and holds (PLAN §6.6), then leaves.
   */
  keep?: ReadonlySet<ID>;
  /** Quest tab: only top-level quests of this category (ignored when zoomed in). */
  category?: CategoryTab;
  /**
   * A locked quest order (store: captured when editing starts), so nothing
   * moves under the editor. Quests not in it (added since) come first.
   */
  order?: readonly ID[] | null;
}

/**
 * ACTIVE tab rows: a depth-first walk in display order.
 *
 * Skips:
 *   - soft-deleted tasks (and so their whole subtree),
 *   - done **top-level** tasks, which live on the COMPLETED tab (PLAN §9.5),
 *   - children of collapsed tasks (the collapsed row itself is shown).
 * Done subtasks are always included, struck through in place (PLAN §2).
 * When zoomed in, the zoom root's direct children count as "top of the
 * list", but done ones stay visible, since they aren't top-level tasks.
 *
 * Quests (true top level) show by priority first (!!! → none), then newest-
 * modified first, so a new quest is at the top of its priority and the
 * ones you're working on rise (user requests 2026-10-09); `updatedAt`
 * bubbles up from any change inside a quest. Everything below them keeps
 * its manual order. The order refreshes on structural changes, never while
 * typing, and is locked while editing (`order`), so a row can't jump under
 * you.
 */
export function flattenActive(state: TasksState, options: ActiveOptions = {}): Row[] {
  const rootId = options.zoomRootId ?? null;
  const rows: Row[] = [];

  // Iterative walk: a stack of [id, depth], children pushed in reverse so they
  // come out in display order. Iterative so depth can't overflow the call stack.
  const stack: [ID, number][] = [];
  const top = rootId === null ? questOrder(state, options.category ?? 'all', options.order) : childIds(state, rootId);
  for (let i = top.length - 1; i >= 0; i--) stack.push([top[i]!, 0]);

  while (stack.length) {
    const [id, depth] = stack.pop()!;
    const task = findTask(state, id);
    if (!task || task.deletedAt !== null) continue;
    // Done top-level tasks belong to COMPLETED (only true top level, not zoom roots' children).
    if (rootId === null && depth === 0 && task.done && !options.keep?.has(id)) continue;

    const kids = childIds(state, id);
    const progress = countProgress(state, kids);
    rows.push({ id, depth, hasChildren: progress.total > 0, progress });

    if (!task.collapsed) {
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i]!, depth + 1]);
    }
  }
  return rows;
}

/**
 * COMPLETED tab rows (PLAN §9.6): done top-level tasks, most recently
 * modified first. Their subtrees are collapsed unless the task's ID is in
 * `expanded`; the COMPLETED tab tracks its own expanded set, separate from
 * `task.collapsed`, so it defaults to collapsed without changing the ACTIVE view.
 */
export function flattenCompleted(state: TasksState, expanded: ReadonlySet<ID> = new Set(), category: CategoryTab = 'all'): Row[] {
  const done: Task[] = [];
  for (const id of state.children[ROOT] ?? []) {
    const t = findTask(state, id);
    if (t && t.done && t.deletedAt === null && onTab(t, category)) done.push(t);
  }
  // Newest first; ties keep the manual order (Array.prototype.sort is stable).
  done.sort((a, b) => b.updatedAt - a.updatedAt);

  const rows: Row[] = [];
  for (const t of done) {
    const kids = childIds(state, t.id);
    const progress = countProgress(state, kids);
    rows.push({ id: t.id, depth: 0, hasChildren: progress.total > 0, progress });
    if (expanded.has(t.id)) appendSubtree(state, t.id, 1, rows);
  }
  return rows;
}

/**
 * Top-level quest IDs on `tab` in display order: higher priority first, then
 * most recently modified. Ties (e.g. pasted together) keep their manual
 * order: the sort is stable. With a locked `order`, that order is kept
 * instead (quests not in it, i.e. added since, come first).
 */
export function questOrder(state: TasksState, tab: CategoryTab = 'all', order?: readonly ID[] | null): ID[] {
  const quests: Task[] = [];
  for (const id of state.children[ROOT] ?? []) {
    const t = findTask(state, id);
    if (t && onTab(t, tab)) quests.push(t);
  }
  if (order) {
    const at = new Map(order.map((id, i) => [id, i]));
    quests.sort((a, b) => (at.get(a.id) ?? -1) - (at.get(b.id) ?? -1));
  } else {
    quests.sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt);
  }
  return quests.map((t) => t.id);
}

/** Appends every live descendant of `parentId` (fully expanded) in display order. */
function appendSubtree(state: TasksState, parentId: ID, depth: number, rows: Row[]): void {
  const stack: [ID, number][] = [];
  const kids = childIds(state, parentId);
  for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i]!, depth]);
  while (stack.length) {
    const [id, d] = stack.pop()!;
    const task = findTask(state, id);
    if (!task || task.deletedAt !== null) continue;
    const grand = childIds(state, id);
    const progress = countProgress(state, grand);
    rows.push({ id, depth: d, hasChildren: progress.total > 0, progress });
    for (let i = grand.length - 1; i >= 0; i--) stack.push([grand[i]!, d + 1]);
  }
}

/** Done / total over the live (non-deleted) tasks in `ids`. */
function countProgress(state: TasksState, ids: readonly ID[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const id of ids) {
    const t = findTask(state, id);
    if (!t || t.deletedAt !== null) continue;
    total++;
    if (t.done) done++;
  }
  return { done, total };
}
