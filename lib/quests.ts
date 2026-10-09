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
import type { QuestCategory, Task } from './types';

/** The category tabs in display order, with their labels. */
export const CATEGORIES: readonly { key: QuestCategory; label: string }[] = [
  { key: 'daily', label: 'DAILY' },
  { key: 'main', label: 'MAIN' },
  { key: 'misc', label: 'MISC' },
];

/** A tab of the list: one category, or all of them. */
export type CategoryTab = 'all' | QuestCategory;

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
