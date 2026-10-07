/**
 * lib/outliner.ts: what Enter and Backspace do while editing a title
 * (PLAN §9.3).
 *
 * Layer: pure lib. Each function returns the op to dispatch plus where the
 * editing focus should go next (which task, and the caret position), or
 * null when the key should do nothing special. The editor component just
 * dispatches and moves focus; every rule lives here.
 *
 *   Enter at the end            → new sibling below, focus it
 *   Enter in the middle         → split: text after the caret moves to a new sibling
 *   Enter on an empty task      → outdent it; at top level, discard it and stop editing
 *   Backspace on an empty task  → delete it, focus the end of the previous row
 *   Backspace at the start      → merge into the previous row (if neither has children)
 */
import { editTask, mergeChanges, newTask, type Op, outdent, receiveChildChanges, touchChanges } from './ops';
import { childIds, getTask, liveChildIds } from './tree';
import type { ID, TasksState } from './types';

/** Where editing goes after a key: a task and caret offset, or null to stop editing. */
export type Focus = { id: ID; caret: number } | null;

export interface KeyResult {
  /** The op to dispatch (one undo step), or null if nothing changes. */
  op: Op | null;
  focus: Focus;
}

/**
 * Enter pressed with the caret at `caret` in task `id`'s title.
 * `newId` is the ID for a task that may be created.
 */
export function pressEnter(state: TasksState, id: ID, caret: number, newId: ID, at: number): KeyResult {
  const task = getTask(state, id);

  // Empty task: outdent; already at top level, discard it and stop editing.
  if (task.title === '') {
    const out = outdent(state, id, at);
    if (out) return { op: out, focus: { id, caret: 0 } };
    const hasKids = liveChildIds(state, id).length > 0;
    return { op: hasKids ? null : { type: 'remove', id }, focus: null };
  }

  // Split at the caret: the head stays, the tail becomes the new sibling.
  // Enter at the end is the same rule with an empty tail.
  const head = task.title.slice(0, caret);
  const tail = task.title.slice(caret);
  const index = childIds(state, task.parentId).indexOf(id) + 1;
  const created = newTask(newId, task.parentId, tail, at);
  const ops: Op[] = [{ type: 'insert', parentId: task.parentId, index, tasks: [created], children: {} }];
  if (tail !== '') ops.push(editTask(state, id, { title: head }, at));
  if (task.parentId !== null) ops.push({ type: 'update', changes: receiveChildChanges(state, task.parentId, at) });
  return { op: { type: 'batch', ops }, focus: { id: newId, caret: 0 } };
}

/**
 * Backspace pressed with the caret at the very start of task `id`.
 * `previousId` is the row shown directly above it (or null if it is first).
 */
export function pressBackspaceAtStart(state: TasksState, id: ID, previousId: ID | null, at: number): KeyResult {
  const task = getTask(state, id);
  const hasKids = liveChildIds(state, id).length > 0;

  // Empty task: delete it (unless it has children) and focus the end of the row above.
  if (task.title === '') {
    if (hasKids) return { op: null, focus: { id, caret: 0 } };
    const op: Op = {
      type: 'batch',
      ops: [{ type: 'remove', id }, ...(task.parentId ? [{ type: 'update' as const, changes: touchChanges(state, [task.parentId], at) }] : [])],
    };
    const prev = previousId ? getTask(state, previousId) : null;
    return { op, focus: prev ? { id: prev.id, caret: prev.title.length } : null };
  }

  // Non-empty: merge into the previous row, only if neither has children
  // (merging would otherwise have to decide where the children go).
  if (!previousId || hasKids || liveChildIds(state, previousId).length > 0) return { op: null, focus: { id, caret: 0 } };
  const prev = getTask(state, previousId);
  const op: Op = {
    type: 'batch',
    ops: [
      { type: 'update', changes: mergeChanges([...touchChanges(state, [previousId], at), { id: previousId, fields: { title: prev.title + task.title } }]) },
      { type: 'remove', id },
    ],
  };
  return { op, focus: { id: previousId, caret: prev.title.length } };
}
