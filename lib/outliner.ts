/**
 * lib/outliner.ts: editing-key rules (PLAN §9.3, revised 2026-10-07).
 *
 * Layer: pure lib.
 *
 * Revision after the v0.3.0 device test: editing and creating are kept
 * separate. Enter/Done only *finishes* editing (the store handles that),
 * and new tasks come from the quick-add bar or an explicit "+ SUB" action.
 * So the only key rule left is Backspace on an empty task.
 *
 * Structure while editing (indent, outdent, add subtask) comes from the
 * editing toolbar, which uses the builders in lib/ops.ts.
 */
import { touchChanges, type Op } from './ops';
import { getTask, liveChildIds } from './tree';
import type { ID, TasksState } from './types';

/**
 * Backspace on an empty task: delete it (one undo step). Returns null when
 * the task isn't empty or still has children, since deleting would also
 * delete them, which Backspace should never do.
 */
export function deleteIfEmpty(state: TasksState, id: ID, at: number): Op | null {
  const task = getTask(state, id);
  if (task.title !== '' || liveChildIds(state, id).length > 0) return null;
  const touch: Op[] = task.parentId ? [{ type: 'update', changes: touchChanges(state, [task.parentId], at) }] : [];
  return { type: 'batch', ops: [{ type: 'remove', id }, ...touch] };
}
