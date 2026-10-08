/**
 * store/selectors.ts: derived data, memoized (PLAN §7.2).
 *
 * Layer: store. Rows are recomputed only when `structureVersion` (or a
 * view input such as zoom) changes, never because a title was typed
 * (ARCHITECTURE.md §3).
 *
 * Each store gets its own selector set (makeSelectors), so caches can't
 * leak between stores in tests.
 */
import { addDays, startOfDay } from '@/lib/dates';
import { flattenActive, flattenCompleted, type Row } from '@/lib/flatten';
import { matcher, searchActive, searchCompleted } from '@/lib/search';
import { findTask } from '@/lib/taskMap';
import { ROOT, type TasksState } from '@/lib/types';

import type { Filter } from '@/lib/search';

import type { UiState } from './uiState';

/** Header and tab counts (PLAN §9.1). */
export interface Counts {
  /** Open top-level tasks (the ACTIVE tab badge). */
  active: number;
  /** Done top-level tasks (the COMPLETED tab badge). */
  completed: number;
  /** Tasks at any level checked off today. */
  doneToday: number;
  /** Open, live tasks past their due time. */
  overdue: number;
}

/** Minimal state the selectors read. */
interface SelectorInput {
  tasks: TasksState;
  ui: UiState;
  /** Per-tab search (optional so older callers and tests still work). */
  search?: Record<'active' | 'completed', { query: string; filter: Filter }>;
  /** Just-checked top-level tasks still shown on ACTIVE (see AppStore.lingering). */
  lingering?: readonly string[];
}

const NO_LINGERING: readonly string[] = [];

/** Remembers the last result for one set of keys (enough here: one list per screen). */
function memoLast<K extends unknown[], R>(compute: (...keys: K) => R): (...keys: K) => R {
  let lastKeys: K | null = null;
  let lastResult: R;
  return (...keys: K) => {
    if (lastKeys && keys.length === lastKeys.length && keys.every((k, i) => Object.is(k, lastKeys![i]))) {
      return lastResult;
    }
    lastKeys = keys;
    lastResult = compute(...keys);
    return lastResult;
  };
}

/** Creates memoized selectors for one store. */
export function makeSelectors() {
  // Keyed on structureVersion; `tasks` is passed along but deliberately not a key.
  let activeTasks: TasksState;
  const active = memoLast((_version: number, zoomRootId: string | null, lingering: readonly string[]) =>
    flattenActive(activeTasks, { zoomRootId, keep: lingering.length ? new Set(lingering) : undefined }),
  );

  let completedTasks: TasksState;
  const completed = memoLast((_version: number, expanded: readonly string[]) => flattenCompleted(completedTasks, new Set(expanded)));

  // Search results, memoized on the tree version and the search inputs.
  // (Titles aren't structural, but a search re-runs when the query changes.)
  const found = memoLast((_v: number, zoom: string | null, query: string, filter: Filter, minute: number) =>
    searchActive(activeTasks, matcher(query, filter, minute * 60_000)!, zoom),
  );
  const foundCompleted = memoLast((_v: number, query: string) => searchCompleted(completedTasks, matcher(query, 'all', 0)!));

  let countTasks: TasksState;
  // `minute` (not `now`) is the key, so counts refresh at most once a minute.
  const counts = memoLast((_version: number, minute: number): Counts => computeCounts(countTasks, minute * 60_000));

  return {
    /** Rows for the ACTIVE tab (respects zoom; search/filter results when searching). */
    activeRows(s: SelectorInput): Row[] {
      activeTasks = s.tasks;
      const q = s.search?.active;
      if (q && (q.query.trim() || q.filter !== 'all')) {
        // Overdue depends on the time: results refresh at most once a minute.
        return found(s.tasks.structureVersion, s.ui.zoomRootId, q.query, q.filter, Math.floor(Date.now() / 60_000));
      }
      return active(s.tasks.structureVersion, s.ui.zoomRootId, s.lingering ?? NO_LINGERING);
    },
    /** Rows for the COMPLETED tab (search results when searching). */
    completedRows(s: SelectorInput): Row[] {
      completedTasks = s.tasks;
      const q = s.search?.completed;
      if (q && q.query.trim()) return foundCompleted(s.tasks.structureVersion, q.query);
      return completed(s.tasks.structureVersion, s.ui.completedExpanded);
    },
    /** Header and tab counts at time `now`. */
    counts(s: SelectorInput, now: number): Counts {
      countTasks = s.tasks;
      return counts(s.tasks.structureVersion, Math.floor(now / 60_000));
    },
  };
}

/** Counts (see Counts). O(n) over all tasks; memoized by the caller. */
export function computeCounts(tasks: TasksState, now: number): Counts {
  const result: Counts = { active: 0, completed: 0, doneToday: 0, overdue: 0 };

  // Tab badges: top-level tasks only.
  for (const id of tasks.children[ROOT] ?? []) {
    const t = findTask(tasks, id);
    if (!t || t.deletedAt !== null) continue;
    if (t.done) result.completed++;
    else result.active++;
  }

  // Today's local bounds, computed once: comparing numbers is much cheaper
  // than building Date objects for each of thousands of done tasks.
  const dayStart = startOfDay(now);
  const dayEnd = addDays(dayStart, 1);

  // doneToday and overdue look at every task, skipping anything inside a
  // deleted subtree (a walk from the root skips those naturally).
  const stack = [...(tasks.children[ROOT] ?? [])];
  while (stack.length) {
    const t = findTask(tasks, stack.pop()!);
    if (!t || t.deletedAt !== null) continue;
    if (t.done && t.doneAt !== null && t.doneAt >= dayStart && t.doneAt < dayEnd) result.doneToday++;
    if (!t.done && t.dueAt !== null && t.dueAt < now) result.overdue++;
    const kids = tasks.children[t.id];
    if (kids) for (let i = 0; i < kids.length; i++) stack.push(kids[i]!);
  }
  return result;
}
