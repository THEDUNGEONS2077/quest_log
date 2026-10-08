/**
 * lib/reminders.ts: which notifications should exist, and how to get there
 * (PLAN §9.8).
 *
 * Layer: pure lib. The notifications service asks the OS what is scheduled,
 * asks this module what *should* be scheduled, and applies the difference.
 * Every notification has a deterministic identifier, `task:<id>:<dueAt>`, so:
 *   - reconciling is a set difference, safe to run any number of times
 *     (launch, foreground, after any change),
 *   - changing a due date naturally cancels the old notification (new id),
 *   - tasks don't need to store OS notification handles.
 */
import { findTask, forEachTask } from './taskMap';
import { ancestors } from './tree';
import type { ID, Task, TasksState } from './types';

/** One notification that should be scheduled. */
export interface Reminder {
  /** Deterministic OS identifier: `task:<taskId>:<at>`. */
  identifier: string;
  taskId: ID;
  /** When it fires (epoch ms). */
  at: number;
  /** The task title. */
  title: string;
  /** The breadcrumb path, e.g. "WORK / Release notes" (empty for a top-level task). */
  body: string;
}

/** Notification identifier for a task due at `at`. */
export function reminderId(taskId: ID, at: number): string {
  return `task:${taskId}:${at}`;
}

/** Parses a reminder identifier back into its task ID, or null if it isn't one of ours. */
export function taskIdOf(identifier: string): ID | null {
  const m = /^task:(.+):(\d+)$/.exec(identifier);
  return m ? m[1]! : null;
}

/** True when the task, or any ancestor, is in Trash. */
function inTrash(state: TasksState, task: Task): boolean {
  return task.deletedAt !== null || ancestors(state, task.id).some((a) => findTask(state, a)?.deletedAt !== null);
}

/**
 * Every reminder that should exist at time `now`: live, open tasks with
 * `notify` on and a due time still in the future. Sorted soonest first and
 * capped at `limit` (iOS allows 64 pending; PLAN §9.8 keeps 60 there).
 */
export function desiredReminders(state: TasksState, now: number, limit = Infinity): Reminder[] {
  const out: Reminder[] = [];
  forEachTask(state, (t) => {
    if (!t.notify || t.done || t.dueAt === null || t.dueAt <= now) return;
    if (inTrash(state, t)) return;
    // A done ancestor means the task is effectively complete (it's on the COMPLETED tab).
    if (ancestors(state, t.id).some((a) => findTask(state, a)!.done)) return;
    const path = ancestors(state, t.id)
      .reverse()
      .map((a) => findTask(state, a)!.title);
    out.push({
      identifier: reminderId(t.id, t.dueAt),
      taskId: t.id,
      at: t.dueAt,
      title: t.title || 'Untitled task',
      body: path.join(' / '),
    });
  });
  out.sort((a, b) => a.at - b.at);
  return out.slice(0, limit);
}

/**
 * What to change so the OS matches `desired`: cancel identifiers we own
 * that aren't wanted, schedule wanted ones that are missing. Identifiers
 * that aren't ours (not `task:…`) are left alone.
 */
export function reconcile(desired: readonly Reminder[], scheduled: readonly string[]): { cancel: string[]; schedule: Reminder[] } {
  const want = new Set(desired.map((r) => r.identifier));
  const have = new Set(scheduled);
  return {
    cancel: scheduled.filter((id) => taskIdOf(id) !== null && !want.has(id)),
    schedule: desired.filter((r) => !have.has(r.identifier)),
  };
}

/** Parses the due time back out of a reminder identifier, or null. */
export function dueAtOf(identifier: string): number | null {
  const m = /^task:.+:(\d+)$/.exec(identifier);
  return m ? Number(m[1]) : null;
}

/** How long SNOOZE pushes a reminder back (PLAN §9.8). */
export const SNOOZE_MS = 15 * 60_000;
