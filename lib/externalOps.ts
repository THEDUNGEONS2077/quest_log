/**
 * lib/externalOps.ts: actions that happen outside the app's UI (PLAN §6.4).
 *
 * Layer: pure lib. Notification buttons (DONE, SNOOZE 15M) and, from Phase
 * 12, the home-screen widget can act while the app is closed. They never
 * touch state directly. Each becomes a small record in the `ops.pending`
 * queue, and draining the queue turns each record into a normal op through
 * this module, so the same rules (cascade, auto-complete) apply wherever an
 * action came from.
 *
 * Every conversion is idempotent: draining the same record twice (say, the
 * app was killed after applying but before clearing the queue) gives the
 * same result as draining it once.
 */
import { check } from './complete';
import { editTask, type Op } from './ops';
import { pinTimeOfDay } from './recurrence';
import { SNOOZE_MS } from './reminders';
import { findTask } from './taskMap';
import type { ID, TasksState } from './types';

/** One queued action from outside the UI. */
export interface ExternalOp {
  kind: 'complete' | 'snooze';
  taskId: ID;
  /** When the user acted (epoch ms). */
  at: number;
  /** Where it came from, for the toast ("COMPLETED FROM NOTIFICATION"). */
  source: 'notification' | 'widget';
  /**
   * The occurrence acted on (the notification's due time). A repeating task
   * never stays done; once it has moved past this occurrence, the action
   * has been applied, which keeps re-draining idempotent.
   */
  dueAt?: number;
}

/**
 * The op for one external action, or null when there's nothing to do (the
 * task is gone, already done, or already snoozed to this time).
 */
export function toOp(state: TasksState, ext: ExternalOp): Op | null {
  const task = findTask(state, ext.taskId);
  if (!task || task.deletedAt !== null) return null;
  if (ext.kind === 'complete') {
    if (task.done) return null; // already applied
    // A repeating task already advanced past this occurrence: already applied.
    if (task.repeat && ext.dueAt !== undefined && task.dueAt !== ext.dueAt) return null;
    return check(state, ext.taskId, ext.at).op;
  }
  // Snooze: due 15 minutes after the tap. Deterministic, so re-applying changes nothing.
  const dueAt = ext.at + SNOOZE_MS;
  if (task.dueAt === dueAt && task.notify) return null;
  // A repeating task keeps its usual time for later occurrences (no 09:15 drift).
  const repeat = task.repeat && task.dueAt !== null ? { repeat: pinTimeOfDay(task.repeat, task.dueAt) } : {};
  return editTask(state, ext.taskId, { dueAt, notify: true, ...repeat }, ext.at);
}

/** Parses the stored queue, dropping anything malformed (it must never block the drain). */
export function parseQueue(raw: string | undefined): ExternalOp[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (o): o is ExternalOp =>
        !!o && (o.kind === 'complete' || o.kind === 'snooze') && typeof o.taskId === 'string' && typeof o.at === 'number',
    );
  } catch {
    return [];
  }
}
