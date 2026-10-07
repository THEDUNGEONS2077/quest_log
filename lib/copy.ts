/**
 * lib/copy.ts: Duplicate and "Copy as text" (PLAN §12.6 context menu).
 *
 * Layer: pure lib.
 *   - duplicate: an exact copy of a task and its live subtree, placed right
 *     below the original (same parent). Done states, notes, priority and
 *     dates carry over; OS notification handles don't (Phase 7 schedules
 *     fresh ones).
 *   - toOutlineText: the subtree as an indented plain-text outline, in the
 *     same format paste understands, so copy → paste round-trips:
 *
 *       Groceries
 *         - [ ] milk
 *         - [x] eggs
 */
import { type Op, receiveChildChanges } from './ops';
import { findTask } from './taskMap';
import { childIds, getTask } from './tree';
import type { ID, Task, TasksState } from './types';

/** Live tasks of a subtree in display order, root first; a deleted task hides its subtree. */
function liveSubtree(state: TasksState, id: ID): { task: Task; depth: number }[] {
  const out: { task: Task; depth: number }[] = [];
  const stack: [ID, number][] = [[id, 0]];
  while (stack.length) {
    const [cur, depth] = stack.pop()!;
    const t = findTask(state, cur);
    if (!t || t.deletedAt !== null) continue;
    out.push({ task: t, depth });
    const kids = childIds(state, cur);
    for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i]!, depth + 1]);
  }
  return out;
}

/** Copies task `id` (with its live subtree) to just below itself. One undo step. */
export function duplicate(state: TasksState, id: ID, at: number, newId: () => ID): { op: Op; rootId: ID } {
  const original = getTask(state, id);
  const ids = new Map<ID, ID>();
  const tasks: Task[] = [];
  const children: Record<ID, ID[]> = {};
  for (const { task } of liveSubtree(state, id)) {
    const copyId = newId();
    ids.set(task.id, copyId);
    const parentId = task.id === id ? original.parentId : ids.get(task.parentId!)!;
    tasks.push({ ...task, id: copyId, parentId, notificationIds: [], createdAt: at, updatedAt: at });
    if (task.id !== id) (children[parentId!] ??= []).push(copyId);
  }
  const index = childIds(state, original.parentId).indexOf(id) + 1;
  const ops: Op[] = [{ type: 'insert', parentId: original.parentId, index, tasks, children }];
  if (original.parentId !== null) ops.push({ type: 'update', changes: receiveChildChanges(state, original.parentId, at) });
  return { op: { type: 'batch', ops }, rootId: ids.get(id)! };
}

/**
 * The task and its live subtree as an indented outline (two spaces per
 * level). The root line is the bare title; deeper lines are list items
 * with their checkbox. Notes follow their task as indented `//` lines.
 */
export function toOutlineText(state: TasksState, id: ID): string {
  const lines: string[] = [];
  for (const { task, depth } of liveSubtree(state, id)) {
    const indent = '  '.repeat(depth);
    lines.push(depth === 0 ? task.title : `${indent}- [${task.done ? 'x' : ' '}] ${task.title}`);
    if (task.notes) for (const n of task.notes.split('\n')) lines.push(`${indent}  // ${n}`);
  }
  return lines.join('\n');
}
