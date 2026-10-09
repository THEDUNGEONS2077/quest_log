/**
 * lib/xp.ts: XP, levels and streaks (user request 2026-10-09).
 *
 * Layer: pure lib. Everything here is a plain function of the task tree and
 * the time, so awards are deterministic and testable. The completion logic
 * (lib/complete.ts) calls `awardXp` / `revokeXp`, which turn a completion
 * op into the same op plus its XP changes, so every way of completing a
 * task (checkbox, swipe, multi-select, a notification's DONE) earns XP the
 * same way, and UNDO takes it back exactly.
 *
 * LEVELS: you start at level 0. Going from level L to L+1 takes
 * 50 + 25·L XP: 50 for the first level, then 75, 100, 125… A traditional
 * curve: early levels come quickly, later ones take longer.
 *
 * XP FOR COMPLETING A TASK:
 *   base             10
 *   priority         ! +2   !! +5   !!! +10
 *   quest bonus      +8 for every live subtask under it (any depth): the more
 *                    subtasks a quest has, the more completing it is worth
 *   on time          +5 when it had a due date that hadn't passed yet
 * then multiplied by:
 *   repeat streak    repeating tasks: ×1.1 for each occurrence completed on
 *                    time in a row (up to ×2.0); a late completion resets it
 *   day streak       ×1.05 for each day in a row with a completion, after
 *                    the first (up to ×1.5); missing a day resets it
 * and rounded to a whole number.
 */
import { addDays, dayKey } from './dates';
import type { CompleteResult } from './complete';
import type { FieldChange, Op } from './ops';
import { findTask } from './taskMap';
import { childIds } from './tree';
import type { ID, Progress, Task, TasksState } from './types';

/** The rules above, in one place (shown in the help guide too). */
export const XP_RULES = {
  base: 10,
  priority: [0, 2, 5, 10] as const,
  perSubtask: 8,
  onTime: 5,
  /** Repeat streak: +10% per on-time occurrence in a row, at most 10 steps. */
  repeatStep: 0.1,
  repeatMaxSteps: 10,
  /** Day streak: +5% per day in a row after the first, at most 10 steps. */
  dayStep: 0.05,
  dayMaxSteps: 10,
} as const;

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** XP needed to go from `level` to the next one: 50, 75, 100, … */
export function xpToNext(level: number): number {
  return 50 + 25 * level;
}

/** Where `xp` puts you: the level, XP into it, XP the level needs, and the fraction done. */
export function levelInfo(xp: number): { level: number; into: number; needed: number; fraction: number } {
  let level = 0;
  let left = Math.max(0, xp);
  while (left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  const needed = xpToNext(level);
  return { level, into: left, needed, fraction: left / needed };
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

/** The day streak after a completion at `at` (counts each day once; a missed day restarts it). */
export function progressAfterCompletion(p: Progress, at: number): Progress {
  const today = dayKey(at);
  if (p.lastDay === today) return p;
  const yesterday = dayKey(addDays(at, -1));
  const dayStreak = p.lastDay === yesterday ? p.dayStreak + 1 : 1;
  return { ...p, dayStreak, bestDayStreak: Math.max(p.bestDayStreak, dayStreak), lastDay: today };
}

/** The day streak as shown now: 0 once a whole day has passed without a completion. */
export function currentDayStreak(p: Progress, now: number): number {
  if (p.lastDay === dayKey(now) || p.lastDay === dayKey(addDays(now, -1))) return p.dayStreak;
  return 0;
}

/** The multiplier a day streak gives (×1.0 on the first day, up to ×1.5). */
export function dayMultiplier(dayStreak: number): number {
  return 1 + XP_RULES.dayStep * Math.min(Math.max(0, dayStreak - 1), XP_RULES.dayMaxSteps);
}

/** The multiplier a repeat streak gives (×1.1 for one on-time completion, up to ×2.0). */
export function repeatMultiplier(streak: number): number {
  return 1 + XP_RULES.repeatStep * Math.min(Math.max(0, streak), XP_RULES.repeatMaxSteps);
}

// ---------------------------------------------------------------------------
// XP for one task
// ---------------------------------------------------------------------------

/** Live (not deleted) tasks under `id`, at any depth. */
export function liveSubtaskCount(state: TasksState, id: ID): number {
  let n = 0;
  const stack = [...childIds(state, id)];
  while (stack.length) {
    const t = findTask(state, stack.pop()!);
    if (!t || t.deletedAt !== null) continue;
    n++;
    stack.push(...childIds(state, t.id));
  }
  return n;
}

/** The XP before multipliers: base, priority, quest bonus and on-time bonus. */
export function baseXp(task: Task, subtasks: number, at: number): number {
  const onTime = task.dueAt !== null && at <= task.dueAt;
  return XP_RULES.base + XP_RULES.priority[task.priority] + XP_RULES.perSubtask * subtasks + (onTime ? XP_RULES.onTime : 0);
}

/**
 * What completing `id` now would earn, before streak multipliers: the
 * preview on a quest's progress bar ("+64 XP").
 */
export function previewXp(state: TasksState, id: ID, at: number): number {
  const task = findTask(state, id);
  return task ? baseXp(task, liveSubtaskCount(state, id), at) : 0;
}

// ---------------------------------------------------------------------------
// Awarding and revoking (used by lib/complete.ts)
// ---------------------------------------------------------------------------

/** Calls `onChange` for every field change in an op (batches flattened). */
function walk(op: Op, onChange: (c: FieldChange) => void): void {
  if (op.type === 'update') op.changes.forEach(onChange);
  else if (op.type === 'batch') op.ops.forEach((o) => walk(o, onChange));
}

/**
 * Adds XP to a completion: each task the op checks (`done: true`) earns its
 * XP, recorded on the task and added to the total; the day streak advances.
 * A repeating task that advanced instead (`result.advanced`) earns its XP
 * with its repeat-streak multiplier: the streak is kept on the live task,
 * and the XP on the archived copy when there is one (or added to the total
 * only, for a repeating subtask). Returns the original op unchanged when
 * nothing was completed.
 */
export function awardXp(
  state: TasksState,
  result: Pick<CompleteResult, 'op' | 'advanced'>,
  archiveIdOf: (id: ID, due: number) => ID,
  at: number,
): Op {
  const progress = progressAfterCompletion(state.progress, at);
  const dayMult = dayMultiplier(progress.dayStreak);
  const extra: FieldChange[] = [];
  let earned = 0;

  // Plain completions: every task the op checks.
  walk(result.op, (c) => {
    if (c.fields.done !== true) return;
    const task = findTask(state, c.id);
    if (!task || task.done) return;
    const xp = Math.round(baseXp(task, liveSubtaskCount(state, c.id), at) * dayMult);
    extra.push({ id: c.id, fields: { xp } });
    earned += xp;
  });

  // A repeating task that advanced to its next occurrence.
  if (result.advanced) {
    const r = findTask(state, result.advanced.id);
    if (r && r.dueAt !== null) {
      const onTime = at <= r.dueAt;
      const streak = onTime ? (r.streak ?? 0) + 1 : 0;
      const xp = Math.round(baseXp(r, liveSubtaskCount(state, r.id), at) * repeatMultiplier(streak) * dayMult);
      extra.push({ id: r.id, fields: { streak } });
      // The completed occurrence's archived copy shows what it earned.
      if (r.parentId === null) extra.push({ id: archiveIdOf(r.id, r.dueAt), fields: { xp } });
      earned += xp;
    }
  }

  if (earned === 0 && progress === state.progress) return result.op;
  const ops: Op[] = [result.op];
  if (extra.length) ops.push({ type: 'update', changes: extra });
  ops.push({ type: 'progress', progress: { ...progress, xp: state.progress.xp + earned } });
  return { type: 'batch', ops };
}

/**
 * Takes XP back from an uncheck: every task the op un-checks (`done: false`)
 * returns the XP it had earned, and its record is cleared. The day streak
 * is left alone (a completion did happen that day).
 */
export function revokeXp(state: TasksState, op: Op): Op {
  const extra: FieldChange[] = [];
  let lost = 0;
  walk(op, (c) => {
    if (c.fields.done !== false) return;
    const task = findTask(state, c.id);
    if (!task || !task.done || !task.xp) return;
    extra.push({ id: c.id, fields: { xp: 0 } });
    lost += task.xp;
  });
  if (!lost) return op;
  return {
    type: 'batch',
    ops: [
      op,
      { type: 'update', changes: extra },
      { type: 'progress', progress: { ...state.progress, xp: Math.max(0, state.progress.xp - lost) } },
    ],
  };
}

/** The XP an op's completions add (for the toast: "COMPLETED · +18 XP"). */
export function xpGained(before: TasksState, after: TasksState): number {
  return after.progress.xp - before.progress.xp;
}
