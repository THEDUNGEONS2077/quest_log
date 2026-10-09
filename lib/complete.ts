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
 *   - XP (lib/xp.ts): checking earns XP and unchecking takes it back, inside
 *     the same op, so UNDO and every way of completing treat XP alike.
 *   - Repeating tasks (PLAN §9.9): if the checked task, or a parent it
 *     would auto-complete, repeats, that task *advances* instead of staying
 *     done. Its due date moves to the next occurrence and its subtree resets
 *     to unchecked. A top-level repeating task also leaves a completed copy
 *     on the COMPLETED tab (`repeatSourceId` set; marked ↻). The copy's IDs
 *     are deterministic (`<id>~<old due>`), so applying the same completion
 *     twice can never archive twice.
 */
import { mergeChanges, type FieldChange, newTask, type Op, touchChanges } from './ops';
import { questCategory } from './quests';
import { nextOccurrence } from './recurrence';
import { awardXp, revokeXp } from './xp';
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
  /** A repeating task that advanced to its next occurrence instead of staying done. */
  advanced: { id: ID; nextDue: number } | null;
}

/** ID of the archived copy of task `id` for the occurrence due at `dueAt`. */
export function archiveId(id: ID, dueAt: number): ID {
  return `${id}~${dueAt}`;
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
 * The op includes the XP earned (lib/xp.ts awardXp).
 */
export function check(state: TasksState, id: ID, at: number): CompleteResult {
  const r = checkWithoutXp(state, id, at);
  return { ...r, op: awardXp(state, r, archiveId, at) };
}

/** check() without XP: which tasks complete, auto-complete or advance. */
function checkWithoutXp(state: TasksState, id: ID, at: number): CompleteResult {
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

  // 3. Repeat: the lowest task in the completed chain (the task itself, then
  // the parents it auto-completes) that has a repeat rule and a due date
  // advances instead. Everything above it stays as it was.
  const completedChain = [id, ...autoCompleted];
  const pivot = completedChain.map((c) => getTask(state, c)).find((t) => t.repeat !== null && t.dueAt !== null && !t.done);
  if (pivot) return advance(state, pivot, id, at, pivot.id === id ? [] : autoCompleted.slice(0, autoCompleted.indexOf(pivot.id)));

  // The top-level task of this chain moves to COMPLETED if it's now done.
  const chain = [id, ...ancestors(state, id)];
  const top = chain[chain.length - 1]!;
  const completedTopLevel = getTask(state, top).parentId === null && doneNow.has(top) && !getTask(state, top).done ? top : null;

  const op: Op = { type: 'update', changes: mergeChanges([...touchChanges(state, [id], at), ...changes]) };
  return { op, autoCompleted, completedTopLevel, advanced: null };
}

/**
 * Advances repeating task `r` (PLAN §9.9): its due date moves to the next
 * future occurrence, and it and its live subtree reset to unchecked. A
 * top-level `r` also gets a completed copy archived on COMPLETED.
 * `checkedId` is the task the user actually checked (for updatedAt
 * bubbling); `autoCompleted` are parents below `r` that completed on the way.
 */
function advance(state: TasksState, r: Task, checkedId: ID, at: number, autoCompleted: ID[]): CompleteResult {
  const nextDue = nextOccurrence(r.repeat!, r.dueAt!, at, at);
  const subtree = liveSubtree(state, r.id);

  // The live task: next date, everything unchecked again.
  const reset: FieldChange[] = subtree.filter((t) => t.done).map((t) => ({ id: t.id, fields: { done: false, doneAt: null } }));
  const ops: Op[] = [
    {
      type: 'update',
      changes: mergeChanges([...touchChanges(state, [checkedId], at), ...reset, { id: r.id, fields: { dueAt: nextDue } }]),
    },
  ];

  // Top level: archive this occurrence as a completed copy (no repeat, no reminder).
  // The copy keeps its quest's tab: a quest whose DAILY comes from its daily repeat
  // would otherwise land on MAIN once the repeat is taken off (bug 2026-10-09).
  if (r.parentId === null) {
    const copyId = (orig: ID) => archiveId(orig, r.dueAt!);
    const tasks: Task[] = subtree.map((t) => ({
      ...t,
      id: copyId(t.id),
      parentId: t.id === r.id ? null : copyId(t.parentId!),
      done: true,
      doneAt: t.done && t.doneAt !== null ? t.doneAt : at,
      notify: false,
      notificationIds: [],
      repeat: null,
      repeatSourceId: t.id === r.id ? r.id : null,
      ...(t.id === r.id && { category: questCategory(r) }),
      collapsed: true,
      createdAt: at,
      updatedAt: at,
    }));
    const children: Record<ID, ID[]> = {};
    for (const t of tasks.slice(1)) (children[t.parentId!] ??= []).push(t.id);
    // Already archived (the same completion applied twice): don't insert again.
    if (!findTask(state, tasks[0]!.id)) {
      ops.push({ type: 'insert', parentId: null, index: childIds(state, null).length, tasks, children });
    }
  }
  return { op: { type: 'batch', ops }, autoCompleted, completedTopLevel: null, advanced: { id: r.id, nextDue } };
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
  // Unchecked tasks give back the XP they earned (lib/xp.ts).
  return revokeXp(state, { type: 'update', changes: mergeChanges([...touchChanges(state, [id], at), ...changes]) });
}

/**
 * Run again (PLAN §9.6): a fresh copy of a completed task and its live
 * subtree, all unchecked, added to the end of the ACTIVE list. Notes,
 * priority and the quest's tab (DAILY / MAIN / MISC) carry over; dates,
 * repeat rules and notification handles don't (a reused checklist shouldn't
 * inherit last time's alarms).
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
      // The copy goes back to the tab the quest was on, not to MAIN.
      ...(t.id === id && parentId === null && { category: questCategory(t) }),
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
