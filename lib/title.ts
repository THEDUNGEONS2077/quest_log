/**
 * lib/title.ts: objectives (subtasks) start with a capital letter (user
 * request 2026-10-09).
 *
 * Layer: pure lib. Two halves:
 *   - saving: an objective's title gets its capital when it's typed (the
 *     editing session's end), pasted or quick-added, so new data is stored
 *     that way (store/createStore.ts, lib/paste.ts);
 *   - showing: shownTitle() capitalizes on display as well. That covers
 *     titles saved before this rule and quests moved under another quest.
 *     Their stored title isn't rewritten: that would be an edit (an undo
 *     step, and a move to the top by "last modified") nobody made.
 * Quests keep their title as typed: the list draws them in capitals anyway.
 */
import type { ID, Task } from './types';

/**
 * `text` with its first character upper-cased when it's a lowercase letter.
 * Always the same length (search highlights are ranges into the stored
 * title), so a letter whose capital is longer (ß → SS) is left as it is.
 */
export function capitalizeFirst(text: string): string {
  const code = text.codePointAt(0);
  if (code === undefined) return text;
  const first = String.fromCodePoint(code);
  const upper = first.toUpperCase();
  if (upper === first || upper.length !== first.length) return text;
  return upper + text.slice(first.length);
}

/** The title to store for a task under `parentId`: objectives get their capital, quests stay as typed. */
export function titleFor(parentId: ID | null, title: string): string {
  return parentId === null ? title : capitalizeFirst(title);
}

/** The title to show for `task` (see the file header). */
export function shownTitle(task: Pick<Task, 'title' | 'parentId'>): string {
  return titleFor(task.parentId, task.title);
}
