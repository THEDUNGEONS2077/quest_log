/**
 * lib/quests.ts: quest categories, the tabs of the ACTIVE list (user
 * request 2026-10-09).
 *
 *   [ ALL ][ DAILY ][ MAIN ][ MISC ]
 *
 * Layer: pure lib. Every quest (top-level task) belongs to one category:
 *   - daily: things done every day. A quest added on the DAILY tab repeats
 *            daily by default (store quickAdd), so it resets each day and
 *            earns the day and repeat streaks (lib/xp.ts).
 *   - main:  the bigger goals (the default).
 *   - misc:  everything else.
 * The category is stored on the quest (`task.category`). Quests from
 * before categories existed get one derived here: repeating daily → daily,
 * anything else → main.
 */
import type { FieldChange, Op } from './ops';
import { findTask } from './taskMap';
import { type QuestCategory, ROOT, type Task, type TasksState } from './types';

/** The category tabs in display order, with their labels. */
export const CATEGORIES: readonly { key: QuestCategory; label: string }[] = [
  { key: 'daily', label: 'DAILY' },
  { key: 'main', label: 'MAIN' },
  { key: 'misc', label: 'MISC' },
];

/** A tab of the list: one category, or all of them. */
export type CategoryTab = 'all' | QuestCategory;

/** The quest tabs in screen order, left to right. */
export const CATEGORY_TABS: readonly CategoryTab[] = ['all', ...CATEGORIES.map((c) => c.key)];

/** The category a quest belongs to (stored, or derived for older data). */
export function questCategory(task: Pick<Task, 'category' | 'repeat'>): QuestCategory {
  if (task.category) return task.category;
  return task.repeat && task.repeat.freq === 'day' ? 'daily' : 'main';
}

/** The category a quest added while `tab` is shown gets (ALL adds to MAIN). */
export function categoryForNew(tab: CategoryTab): QuestCategory {
  return tab === 'all' ? 'main' : tab;
}

/** Does a quest show on `tab`? */
export function onTab(task: Pick<Task, 'category' | 'repeat'>, tab: CategoryTab): boolean {
  return tab === 'all' || questCategory(task) === tab;
}

/**
 * Repair for completed copies of repeating quests saved before v1.5.2
 * (bug 2026-10-09). A copy is archived without its repeat rule, so a copy
 * whose quest was DAILY only through its daily repeat (no stored category)
 * fell to MAIN. Each such copy gets its quest's category stored, looked up
 * through `repeatSourceId`; a copy whose quest is gone is left as it is.
 * Returns null when there's nothing to do. Run at launch and after an
 * import, outside undo history (it isn't a user action).
 */
export function pinArchivedCategories(state: TasksState): Op | null {
  const changes: FieldChange[] = [];
  for (const id of state.children[ROOT] ?? []) {
    const copy = findTask(state, id);
    if (!copy || copy.category || copy.repeatSourceId === null) continue;
    const source = findTask(state, copy.repeatSourceId);
    if (source) changes.push({ id, fields: { category: questCategory(source) } });
  }
  return changes.length ? { type: 'update', changes } : null;
}
