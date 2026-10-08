/**
 * lib/widget.ts: the home screen widget's data (PLAN §11.1, §11.2).
 *
 * Layer: pure lib. The app writes a small `widget.snapshot` whenever the
 * tasks change; the widget renders only from that snapshot, so drawing it
 * never needs the whole tree.
 *
 * Which tasks: open tasks you can act on, which means no done or deleted
 * tasks, and no groups that still have open subtasks (checking a group
 * from the home screen would complete everything inside it). Order:
 * overdue first, then due today, then high priority, then the list's own
 * order. Due labels are worked out when the widget is drawn, not when the
 * snapshot is written, so "OVERDUE" stays right as time passes.
 */
import { addDays, formatDue, startOfDay } from './dates';
import { findTask } from './taskMap';
import { ROOT, type ID, type Priority, type TasksState } from './types';

/** Most tasks the widget shows (large size, PLAN §11.1). */
export const WIDGET_MAX_TASKS = 8;

/** One task as the widget needs it. */
export interface WidgetTask {
  id: ID;
  title: string;
  dueAt: number | null;
  priority: Priority;
  repeat: boolean;
}

/** What the widget draws from (stored as JSON under `widget.snapshot`). */
export interface WidgetSnapshot {
  /** Format version, so an old snapshot is never misread. */
  v: 1;
  /** When it was built (epoch ms). */
  at: number;
  /** Open top-level tasks (the ACTIVE tab count). */
  active: number;
  tasks: WidgetTask[];
}

/** Rank buckets: lower comes first. */
function rankOf(dueAt: number | null, priority: Priority, now: number, dayEnd: number): number {
  if (dueAt !== null && dueAt < now) return 0; // overdue
  if (dueAt !== null && dueAt < dayEnd) return 1; // due later today
  if (priority === 3) return 2; // high priority
  return 3;
}

/**
 * Builds the snapshot at time `now`: the top `max` actionable tasks (see
 * file header) and the ACTIVE count. O(n) over open tasks.
 */
export function buildSnapshot(tasks: TasksState, now: number, max: number = WIDGET_MAX_TASKS): WidgetSnapshot {
  const dayEnd = addDays(startOfDay(now), 1);
  const picked: { task: WidgetTask; rank: number; order: number }[] = [];
  let active = 0;
  let order = 0;

  // Depth-first in list order; done and deleted tasks are skipped with their subtrees.
  const walk = (parent: ID | null) => {
    for (const id of tasks.children[parent ?? ROOT] ?? []) {
      const t = findTask(tasks, id);
      if (!t || t.deletedAt !== null || t.done) continue;
      if (parent === null) active++;
      const openChildren = (tasks.children[id] ?? []).some((c) => {
        const child = findTask(tasks, c);
        return !!child && !child.done && child.deletedAt === null;
      });
      if (!openChildren) {
        picked.push({
          task: { id, title: t.title || 'Untitled task', dueAt: t.dueAt, priority: t.priority, repeat: t.repeat !== null },
          rank: rankOf(t.dueAt, t.priority, now, dayEnd),
          order: order++,
        });
      }
      walk(id);
    }
  };
  walk(null);

  // Overdue and today by time, then list order; everything else by list order.
  picked.sort((a, b) => a.rank - b.rank || (a.rank <= 1 ? a.task.dueAt! - b.task.dueAt! : 0) || a.order - b.order);
  return { v: 1, at: now, active, tasks: picked.slice(0, max).map((p) => p.task) };
}

/** Reads a stored snapshot; anything unreadable gives null (the widget then shows "open the app"). */
export function parseSnapshot(raw: string | undefined): WidgetSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as WidgetSnapshot;
    return s && s.v === 1 && Array.isArray(s.tasks) ? s : null;
  } catch {
    return null;
  }
}

/**
 * The snapshot with one task removed: the widget's instant response to a
 * tap on [ ], before the real change has been applied (PLAN §11.2).
 */
export function withoutTask(snapshot: WidgetSnapshot, id: ID): WidgetSnapshot {
  return { ...snapshot, tasks: snapshot.tasks.filter((t) => t.id !== id) };
}

/** The right-hand label for a widget row at time `now`: "OVERDUE", "17:00", "FRI 16:00", or "". */
export function widgetDueLabel(dueAt: number | null, now: number): { text: string; overdue: boolean } {
  if (dueAt === null) return { text: '', overdue: false };
  if (dueAt < now) return { text: 'OVERDUE', overdue: true };
  return { text: formatDue(dueAt, now), overdue: false };
}

/** How many rows fit a widget of this height (dp): 3 for small, 4 for medium, up to 8 for large. */
export function rowsForHeight(heightDp: number): number {
  // Header about 40 dp, rows about 34 dp each (measured from the widget layout).
  return Math.max(3, Math.min(WIDGET_MAX_TASKS, Math.floor((heightDp - 40) / 34)));
}
