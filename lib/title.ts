/**
 * lib/title.ts: how objective (subtask) titles are capitalized (user
 * requests 2026-10-09).
 *
 * Layer: pure lib. Two halves:
 *   - saving: an objective's title gets a capital first letter when it's
 *     typed (the editing session's end), pasted or quick-added
 *     (store/createStore.ts, lib/paste.ts). Only the first letter: the
 *     rest is stored as typed;
 *   - showing: shownTitle() shows every word of an objective with a capital
 *     first letter ("buy oat milk" → "Buy Oat Milk"), on display only. That
 *     also covers titles saved before these rules and quests moved under
 *     another quest, without rewriting anything: a rewrite would be an edit
 *     (an undo step, and a move to the top by "last modified") nobody made.
 *     The editor shows the title as stored.
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

/** Characters that may open a word before its first letter: "(maybe)" → "(Maybe)". */
const OPENERS = '([{"\'“‘«¿¡';

/**
 * `text` with the first letter of every word upper-cased (words are split
 * by spaces). A word that already has a capital in it was written that way
 * on purpose ("iPhone", "eBay", "NASA") and stays as it is. Same length
 * always, like capitalizeFirst.
 */
export function capitalizeWords(text: string): string {
  return text.replace(/\S+/gu, (word) => {
    if (/\p{Lu}/u.test(word)) return word;
    let start = 0;
    while (start < word.length && OPENERS.includes(word[start]!)) start++;
    return word.slice(0, start) + capitalizeFirst(word.slice(start));
  });
}

/** The title to store for a task under `parentId`: objectives get their capital, quests stay as typed. */
export function titleFor(parentId: ID | null, title: string): string {
  return parentId === null ? title : capitalizeFirst(title);
}

/** The title to show for `task`: objectives with every word capitalized, quests as typed (see the file header). */
export function shownTitle(task: Pick<Task, 'title' | 'parentId'>): string {
  return task.parentId === null ? task.title : capitalizeWords(task.title);
}
