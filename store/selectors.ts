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
import { type CategoryTab, questCategory } from '@/lib/quests';
import { liveSubtaskCount } from '@/lib/xp';

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

/** Open (active) and done (completed) quests on each quest tab. */
export type TabCounts = Record<CategoryTab, { active: number; completed: number }>;

/** Minimal state the selectors read. */
interface SelectorInput {
  tasks: TasksState;
  ui: UiState;
  /** Per-tab search (optional so older callers and tests still work). */
  search?: Record<'active' | 'completed', { query: string; filter: Filter }>;
  /** Just-checked top-level tasks still shown on ACTIVE (see AppStore.lingering). */
  lingering?: readonly string[];
  /** The quest order locked while editing (see AppStore.questOrderLock). */
  questOrderLock?: readonly string[] | null;
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
  const active = memoLast(
    (_version: number, zoomRootId: string | null, lingering: readonly string[], category: CategoryTab, order: readonly string[] | null) =>
      flattenActive(activeTasks, { zoomRootId, keep: lingering.length ? new Set(lingering) : undefined, category, order }),
  );

  let completedTasks: TasksState;
  const completed = memoLast((_version: number, expanded: readonly string[], category: CategoryTab) =>
    flattenCompleted(completedTasks, new Set(expanded), category),
  );

  // Open and done quests per tab, for the tab badges (one pass per structure change).
  let tabTasks: TasksState;
  const tabCounts = memoLast((_version: number): TabCounts => {
    const counts: TabCounts = {
      all: { active: 0, completed: 0 },
      daily: { active: 0, completed: 0 },
      main: { active: 0, completed: 0 },
      misc: { active: 0, completed: 0 },
    };
    for (const id of tabTasks.children[ROOT] ?? []) {
      const t = findTask(tabTasks, id);
      if (!t || t.deletedAt !== null) continue;
      const key = t.done ? 'completed' : 'active';
      counts.all[key]++;
      counts[questCategory(t)][key]++;
    }
    return counts;
  });

  // Search results, memoized on the tree version and the search inputs.
  // (Titles aren't structural, but a search re-runs when the query changes.)
  const found = memoLast((_v: number, zoom: string | null, query: string, filter: Filter, minute: number) =>
    searchActive(activeTasks, matcher(query, filter, minute * 60_000)!, zoom),
  );
  const foundCompleted = memoLast((_v: number, query: string) => searchCompleted(completedTasks, matcher(query, 'all', 0)!));

  let countTasks: TasksState;
  // `minute` (not `now`) is the key, so counts refresh at most once a minute.
  const counts = memoLast((_version: number, minute: number): Counts => computeCounts(countTasks, minute * 60_000));

  // Live subtask counts (any depth) for the quest XP preview: filled lazily,
  // one entry per asked-for task, and dropped whenever the structure changes.
  let subtaskCache = { version: -1, counts: new Map<string, number>() };

  return {
    /**
     * Live subtasks under `id`, any depth (lib/xp.ts quest bonus). Cached per
     * structureVersion, so group rows can ask on every render (typing never
     * changes the structure).
     */
    subtaskCount(s: SelectorInput, id: string): number {
      if (subtaskCache.version !== s.tasks.structureVersion) subtaskCache = { version: s.tasks.structureVersion, counts: new Map() };
      let n = subtaskCache.counts.get(id);
      if (n === undefined) {
        n = liveSubtaskCount(s.tasks, id);
        subtaskCache.counts.set(id, n);
      }
      return n;
    },
    /** Rows for the ACTIVE tab (respects zoom; search/filter results when searching). */
    activeRows(s: SelectorInput): Row[] {
      activeTasks = s.tasks;
      const q = s.search?.active;
      if (q && (q.query.trim() || q.filter !== 'all')) {
        // Overdue depends on the time: results refresh at most once a minute.
        return found(s.tasks.structureVersion, s.ui.zoomRootId, q.query, q.filter, Math.floor(Date.now() / 60_000));
      }
      return active(
        s.tasks.structureVersion,
        s.ui.zoomRootId,
        s.lingering ?? NO_LINGERING,
        s.ui.category ?? 'all',
        s.questOrderLock ?? null,
      );
    },
    /** Rows for the COMPLETED tab (search results when searching). */
    completedRows(s: SelectorInput): Row[] {
      completedTasks = s.tasks;
      const q = s.search?.completed;
      if (q && q.query.trim()) return foundCompleted(s.tasks.structureVersion, q.query);
      return completed(s.tasks.structureVersion, s.ui.completedExpanded, s.ui.category ?? 'all');
    },
    /** Open and done quests on each quest tab (lib/quests.ts). */
    tabCounts(s: SelectorInput): TabCounts {
      tabTasks = s.tasks;
      return tabCounts(s.tasks.structureVersion);
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
