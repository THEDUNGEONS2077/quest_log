/**
 * lib/bulk.ts: actions on several tasks at once, Move to…, sorting, and
 * Trash (PLAN §9.12, §9.14–9.16).
 *
 * Layer: pure lib. Every function returns ONE op (one undo step), built by
 * applying single-task builders in sequence to an evolving tree, so each
 * step sees the result of the previous one.
 *
 * Selection rule (PLAN §9.14): selecting a parent includes its subtree, so
 * bulk actions use only the selection's *roots* (selected tasks with no
 * selected ancestor). Their subtrees come along.
 */
import { check } from './complete';
import { addTask, apply, editTask, moveTask, newTask, type Op, softDelete } from './ops';
import { findTask, forEachTask } from './taskMap';
import { ancestors, childIds, getTask, isInSubtree } from './tree';
import type { ID, Task, TaskFields, TasksState } from './types';

/** Builds one batch op from steps applied in order to the evolving tree. Null if no step did anything. */
export function sequence(state: TasksState, steps: ((s: TasksState) => Op | null)[]): Op | null {
  const ops: Op[] = [];
  let current = state;
  for (const step of steps) {
    const op = step(current);
    if (!op) continue;
    ops.push(op);
    current = apply(current, op).state;
  }
  return ops.length ? { type: 'batch', ops } : null;
}

/** Selected tasks with no selected ancestor, in tree order (subtrees come with them). */
export function selectionRoots(state: TasksState, selected: readonly ID[]): ID[] {
  const set = new Set(selected.filter((id) => findTask(state, id)));
  const roots = [...set].filter((id) => !ancestors(state, id).some((a) => set.has(a)));
  // Tree order: by the path of indices from the root.
  const path = (id: ID) => [...ancestors(state, id).reverse(), id].map((x) => childIds(state, getTask(state, x).parentId).indexOf(x));
  return roots.sort((a, b) => {
    const pa = path(a);
    const pb = path(b);
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
    return pa.length - pb.length;
  });
}

/** DONE: completes every selected root (cascade and auto-complete rules apply). */
export function completeMany(state: TasksState, ids: readonly ID[], at: number): Op | null {
  return sequence(
    state,
    selectionRoots(state, ids).map((id) => (s: TasksState) => (getTask(s, id).done ? null : check(s, id, at).op)),
  );
}

/** PRI / DUE etc.: the same field values on every selected root. */
export function editMany(state: TasksState, ids: readonly ID[], fields: Partial<TaskFields>, at: number): Op | null {
  return sequence(
    state,
    selectionRoots(state, ids).map((id) => (s: TasksState) => editTask(s, id, fields, at)),
  );
}

/** DEL: every selected root to Trash. */
export function deleteMany(state: TasksState, ids: readonly ID[], at: number): Op | null {
  return sequence(
    state,
    selectionRoots(state, ids).map((id) => (s: TasksState) => softDelete(s, id, at)),
  );
}

/**
 * MOVE / Move to… (PLAN §9.15): the selected roots move, with their
 * subtrees, to the end of `parentId` (null = top level), keeping their
 * order. Returns null if the destination is inside one of them.
 */
export function moveManyTo(state: TasksState, ids: readonly ID[], parentId: ID | null, at: number): Op | null {
  const roots = selectionRoots(state, ids);
  if (parentId !== null && roots.some((r) => isInSubtree(state, parentId, r))) return null;
  return sequence(
    state,
    roots.map((id) => (s: TasksState) => moveTask(s, id, parentId, childIds(s, parentId).filter((c) => c !== id).length, at)),
  );
}

/**
 * GROUP (PLAN §9.14): wraps the selected roots in a new parent task, placed
 * where the first of them was. Returns the op and the new group's ID (the
 * UI starts editing its title).
 */
export function groupMany(state: TasksState, ids: readonly ID[], groupId: ID, at: number): { op: Op; groupId: ID } | null {
  const roots = selectionRoots(state, ids);
  const first = roots[0];
  if (!first) return null;
  const parentId = getTask(state, first).parentId;
  const index = childIds(state, parentId).indexOf(first);
  const op = sequence(state, [
    (s) => addTask(s, newTask(groupId, parentId, '', at), index),
    ...roots.map((id) => (s: TasksState) => moveTask(s, id, groupId, childIds(s, groupId).length, at)),
  ]);
  return op ? { op, groupId } : null;
}

/** Sort keys for "Sort subtasks" (PLAN §9.12). */
export type SortKey = 'priority' | 'due' | 'alpha';

/**
 * Sort subtasks (PLAN §9.12): a one-time reorder of a parent's children,
 * as one undoable step; manual order is kept afterwards. The sort is
 * stable, so ties keep their current order.
 *   priority: high first · due: soonest first, undated last · alpha: A–Z
 */
export function sortChildren(state: TasksState, parentId: ID | null, key: SortKey, at: number): Op | null {
  const ids = [...childIds(state, parentId)];
  const t = (id: ID) => getTask(state, id);
  const compare: Record<SortKey, (a: ID, b: ID) => number> = {
    priority: (a, b) => t(b).priority - t(a).priority,
    due: (a, b) => (t(a).dueAt ?? Infinity) - (t(b).dueAt ?? Infinity),
    alpha: (a, b) => t(a).title.localeCompare(t(b).title, undefined, { sensitivity: 'base' }),
  };
  const sorted = [...ids].sort(compare[key]);
  if (sorted.every((id, i) => id === ids[i])) return null; // already in order
  return sequence(
    state,
    sorted.map((id, i) => (s: TasksState) => (childIds(s, parentId)[i] === id ? null : moveTask(s, id, parentId, i, at))),
  );
}

/** Tasks in Trash (PLAN §9.16): deleted tasks whose ancestors aren't deleted, newest first. */
export function trashed(state: TasksState): Task[] {
  const out: Task[] = [];
  forEachTask(state, (t) => {
    if (t.deletedAt === null) return;
    if (ancestors(state, t.id).some((a) => findTask(state, a)?.deletedAt !== null)) return;
    out.push(t);
  });
  return out.sort((a, b) => b.deletedAt! - a.deletedAt!);
}

/** DELETE NOW / EMPTY TRASH: permanently removes trashed tasks (with their subtrees). */
export function purgeMany(state: TasksState, ids: readonly ID[]): Op | null {
  return sequence(
    state,
    ids.map((id) => (s: TasksState) => (findTask(s, id) ? { type: 'remove', id } : null)),
  );
}
