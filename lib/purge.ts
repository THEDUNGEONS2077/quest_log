/**
 * lib/purge.ts: launch-time cleanup rules (PLAN §7.3).
 *
 * Layer: pure lib. Returns ops; the store applies them *without* undo
 * history, since a purge isn't a user action.
 */
import type { Op } from './ops';
import { findTask, forEachTask } from './taskMap';
import { ancestors } from './tree';
import { type ID, type TasksState } from './types';

/** Trash retention (PLAN §9.16). */
export const TRASH_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Hard-deletes tasks that have been in Trash for longer than TRASH_DAYS.
 * Only the deleted *roots* are removed (with their subtrees). A deleted task
 * inside an already-deleted parent goes with its parent. Returns null when
 * nothing has expired.
 */
export function purgeExpiredTrash(state: TasksState, now: number): Op | null {
  const cutoff = now - TRASH_DAYS * DAY;
  const expired: ID[] = [];
  forEachTask(state, (task) => {
    if (task.deletedAt === null || task.deletedAt > cutoff) return;
    // Skip it if an ancestor is also expired; removing the ancestor removes it.
    const ancestorExpired = ancestors(state, task.id).some((a) => {
      const d = findTask(state, a)!.deletedAt;
      return d !== null && d <= cutoff;
    });
    if (!ancestorExpired) expired.push(task.id);
  });
  if (!expired.length) return null;
  return { type: 'batch', ops: expired.map((id) => ({ type: 'remove', id }) as const) };
}
