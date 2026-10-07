/**
 * lib/complete.ts: checking tasks off, and the COMPLETED-tab actions
 * (PLAN §9.5, §9.6, §6.6).
 *
 * Layer: pure lib. Every function returns one op (one undo step) plus what
 * happened, so the UI can pick the right animation, haptic and toast.
 *
 * Rules:
 *   - Checking a task completes its whole live subtree (one op).
 *   - When the last open child of a parent is checked, the parent
 *     auto-completes, and so on up the chain.
 *   - Unchecking a task also unchecks every done ancestor (a done parent
 *     with an open child would be a contradiction).
 *   - Restore (from COMPLETED) unchecks the task *and* its whole subtree.
 *   - Repeating tasks (PLAN §9.9) hook in here in Phase 8.
 */
import { mergeChanges, type FieldChange, newTask, type Op, touchChanges } from './ops';
import { findTask } from './taskMap';
import { ancestors, childIds, getTask, liveChildIds } from './tree';
import { type ID, ROOT, type Task, type TasksState } from './types';

/** What a completion did, for the UI's feedback. */
export interface CompleteResult {
  op: Op;
  /** Parents that auto-completed because their last open child was checked. */
  autoCompleted: ID[];
  /** The top-level task that became done (it moves to COMPLETED), if any. */
  completedTopLevel: ID | null;
}

/**
 * Live tasks in a subtree, root first, in display order. A soft-deleted
 * task is skipped together with everything under it (it's in Trash).
 */
function liveSubtree(state: TasksState, id: ID): Task[] {
  const out: Task[] = [];
  const stack: ID[] = [id];
  while (stack.length) {
    const t = findTask(state, stack.pop()!);
    if (!t || t.deletedAt !== null) continue;
    out.push(t);
    const kids = childIds(state, t.id);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }
  return out;
}

/**
 * Checks task `id`: the task and its live subtree become done, then
 * ancestors whose children are now all done auto-complete (chaining up).
 */
export function check(state: TasksState, id: ID, at: number): CompleteResult {
  const changes: FieldChange[] = [];
  const doneNow = new Set<ID>();

  // 1. The task and its whole live subtree.
  for (const t of liveSubtree(state, id)) {
    doneNow.add(t.id);
    if (!t.done) changes.push({ id: t.id, fields: { done: true, doneAt: at } });
  }

  // 2. Walk up: a parent completes when all its live children are done.
  const autoCompleted: ID[] = [];
  for (const parentId of ancestors(state, id)) {
    const parent = getTask(state, parentId);
    const kids = liveChildIds(state, parentId);
    const allDone = kids.every((k) => doneNow.has(k) || getTask(state, k).done);
    if (!allDone) break; // chain stops at the first parent with open children
    doneNow.add(parentId);
    if (!parent.done) {
      changes.push({ id: parentId, fields: { done: true, doneAt: at } });
      autoCompleted.push(parentId);
    }
  }

  // The top-level task of this chain moves to COMPLETED if it's now done.
  const chain = [id, ...ancestors(state, id)];
  const top = chain[chain.length - 1]!;
  const completedTopLevel = getTask(state, top).parentId === null && doneNow.has(top) && !getTask(state, top).done ? top : null;

  const op: Op = { type: 'update', changes: mergeChanges([...touchChanges(state, [id], at), ...changes]) };
  return { op, autoCompleted, completedTopLevel };
}

/**
 * Unchecks task `id` and every done ancestor. With `subtree` (Restore from
 * COMPLETED), its whole live subtree is unchecked too.
 */
export function uncheck(state: TasksState, id: ID, at: number, opts: { subtree?: boolean } = {}): Op {
  const changes: FieldChange[] = [];
  const reset = (t: Task) => {
    if (t.done) changes.push({ id: t.id, fields: { done: false, doneAt: null } });
  };
  if (opts.subtree) liveSubtree(state, id).forEach(reset);
  else reset(getTask(state, id));
  for (const a of ancestors(state, id)) reset(getTask(state, a));
  return { type: 'update', changes: mergeChanges([...touchChanges(state, [id], at), ...changes]) };
}

/**
 * Run again (PLAN §9.6): a fresh copy of a completed task and its live
 * subtree, all unchecked, added to the end of the ACTIVE list. Notes,
 * priority and repeat rules carry over; dates and notification handles
 * don't (a reused checklist shouldn't inherit last time's alarms).
 * `newId` supplies one ID per copied task.
 */
export function runAgain(state: TasksState, id: ID, at: number, newId: () => ID): { op: Op; rootId: ID } {
  const ids = new Map<ID, ID>(); // old ID → new ID
  const tasks: Task[] = [];
  const children: Record<ID, ID[]> = {};

  for (const t of liveSubtree(state, id)) {
    const copyId = newId();
    ids.set(t.id, copyId);
    const parentId = t.id === id ? null : ids.get(t.parentId!)!;
    tasks.push({
      ...newTask(copyId, parentId, t.title, at),
      notes: t.notes,
      priority: t.priority,
      collapsed: t.collapsed,
    });
    if (parentId !== null) (children[parentId] ??= []).push(copyId);
  }
  const root = childIds(state, null);
  return {
    op: { type: 'insert', parentId: null, index: root.length, tasks, children },
    rootId: ids.get(id)!,
  };
}

/**
 * Clear completed (PLAN §9.6): moves done top-level tasks to Trash. With
 * `olderThanDays`, only those last modified before that many days ago.
 * Returns null when nothing matches.
 */
export function clearCompleted(state: TasksState, now: number, olderThanDays: number | null): { op: Op; count: number } | null {
  const cutoff = olderThanDays === null ? Infinity : now - olderThanDays * 86_400_000;
  const changes: FieldChange[] = [];
  for (const id of state.children[ROOT] ?? []) {
    const t = getTask(state, id);
    if (t.done && t.deletedAt === null && t.updatedAt < cutoff) changes.push({ id, fields: { deletedAt: now } });
  }
  return changes.length ? { op: { type: 'update', changes }, count: changes.length } : null;
}
