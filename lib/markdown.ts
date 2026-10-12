/**
 * lib/markdown.ts: the task tree as one Markdown note, for Obsidian (or any
 * Markdown app). Settings → "Sync to Markdown" writes it to a folder the
 * user picks and overwrites the same file on every SYNC (user request
 * 2026-10-12: "all the data will make logical sense and be actionable").
 *
 * Layer: pure lib (no React, no native code). The note reads on its own and
 * works with Obsidian's popular plugins, without needing any of them:
 *   - YAML front matter (Obsidian "Properties"; Dataview reads it too):
 *     when it was synced, the app version, counts, level and XP;
 *   - a heading per tab (DAILY, MAIN, MISC), then COMPLETED;
 *   - every quest a checkbox, its objectives nested under it (tabs), in the
 *     app's order: Obsidian ticks them, and its outline/folding follow;
 *   - due dates, priorities, repeats and completion dates in the Obsidian
 *     Tasks plugin's emoji format, so that plugin can query, sort and filter
 *     them (📅 due, ⏫/🔼/🔽 priority, 🔁 repeat, ✅ done). The due time,
 *     which that format lacks, is written as 🕐 HH:MM in the description;
 *   - notes as a quote under their task.
 *
 *   ---
 *   quest_log: 1
 *   synced: 2026-10-12T15:04
 *   …
 *   ---
 *   # quest_log
 *   > [!info] Synced from quest_log …
 *   ## MAIN
 *   - [ ] Ship the report ⏫ 📅 2026-10-14
 *   	- [x] Pull the numbers ✅ 2026-10-11
 *   	- [ ] Write it up 🕐 16:00 📅 2026-10-13
 *   		> draft in the shared doc
 *   ## COMPLETED
 *   - [x] Renew passport ✅ 2026-10-09
 *
 * The note is a copy for reading and planning: the app is where tasks
 * change, and each SYNC replaces the file (the note says so at the top).
 * Trash is left out.
 */
import { dayKey, formatMinutes, minutesOfDay } from './dates';
import { questOrder } from './flatten';
import { CATEGORIES, questCategory } from './quests';
import { findTask } from './taskMap';
import { shownTitle } from './title';
import { childIds } from './tree';
import type { Priority, RepeatRule, Task, TasksState } from './types';
import { currentDayStreak, levelInfo } from './xp';

/** The note's file name (fixed: SYNC always writes the same file). */
export const MARKDOWN_FILE_NAME = 'quest_log.md';

/** The format of the note, in its front matter; bumped if its layout changes in a way readers would notice. */
export const MARKDOWN_FORMAT = 1;

/** Which app wrote the note (front matter). */
export interface MarkdownSource {
  version: string;
  build: number;
}

/** Tasks plugin priority signifiers: ! low, !! medium, !!! high. */
const PRIORITY: Record<Priority, string> = { 0: '', 1: '🔽', 2: '🔼', 3: '⏫' };

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** "1st", "2nd", "23rd", "11th". */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * A repeat rule in the Tasks plugin's words ("every day", "every 2 weeks on
 * Monday, Friday", "every weekday", "every month on the 31st", "… when done").
 */
export function repeatText(rule: RepeatRule): string {
  const n = rule.interval;
  const every = (unit: string) => (n === 1 ? `every ${unit}` : `every ${n} ${unit}s`);
  let text: string;
  if (rule.freq === 'week' && rule.weekdays?.length) {
    const days = [...rule.weekdays].sort((a, b) => a - b);
    text = days.join() === '1,2,3,4,5' && n === 1 ? 'every weekday' : `${every('week')} on ${days.map((d) => WEEKDAY[d]).join(', ')}`;
  } else if (rule.freq === 'month' && rule.monthDay) {
    text = `${every('month')} on the ${ordinal(rule.monthDay)}`;
  } else {
    text = every(rule.freq);
  }
  return rule.from === 'completion' ? `${text} when done` : text;
}

/** One line of text: newlines and runs of spaces become single spaces. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A task's checkbox line (without indentation): title, then its fields as Tasks plugin signifiers. */
export function taskLine(task: Task): string {
  const parts = [`- [${task.done ? 'x' : ' '}]`, oneLine(shownTitle(task)) || 'Untitled'];
  if (task.dueAt !== null) parts.push(`🕐 ${formatMinutes(minutesOfDay(task.dueAt))}`);
  // Signifiers last, so the Tasks plugin reads everything before them as the description.
  if (PRIORITY[task.priority]) parts.push(PRIORITY[task.priority]);
  if (task.repeat) parts.push(`🔁 ${repeatText(task.repeat)}`);
  if (task.dueAt !== null) parts.push(`📅 ${dayKey(task.dueAt)}`);
  if (task.done && task.doneAt !== null) parts.push(`✅ ${dayKey(task.doneAt)}`);
  return parts.join(' ');
}

/** Appends `id`'s line, its notes and its live objectives (manual order), indented one tab per level. */
function appendTask(state: TasksState, id: string, depth: number, out: string[]): void {
  const task = findTask(state, id);
  if (!task || task.deletedAt !== null) return;
  const indent = '\t'.repeat(depth);
  out.push(indent + taskLine(task));
  // Notes: a quote inside the list item (one more tab), line breaks kept.
  for (const line of task.notes.trim() ? task.notes.trim().split(/\r?\n/) : []) out.push(`${indent}\t> ${line.trimEnd()}`.trimEnd());
  for (const child of childIds(state, id)) appendTask(state, child, depth + 1, out);
}

/** A front matter value: numbers as they are, text quoted (YAML-safe). */
function yamlValue(value: string | number): string {
  return typeof value === 'number' ? String(value) : JSON.stringify(value);
}

/** Local date and time as "2026-10-12T15:04" (ISO, readable by Obsidian's date properties). */
function localStamp(ts: number): string {
  return `${dayKey(ts)}T${formatMinutes(minutesOfDay(ts))}`;
}

/**
 * The whole note for `state` at `now`. Open quests per tab in the app's
 * order (priority, then most recent), then COMPLETED, newest first. Every
 * task appears once, with all its objectives.
 */
export function toMarkdown(state: TasksState, now: number, source: MarkdownSource): string {
  const roots = childIds(state, null)
    .map((id) => findTask(state, id))
    .filter((t): t is Task => !!t && t.deletedAt === null);
  const open = roots.filter((t) => !t.done);
  const completed = roots.filter((t) => t.done).sort((a, b) => (b.doneAt ?? b.updatedAt) - (a.doneAt ?? a.updatedAt));
  const { level } = levelInfo(state.progress.xp);
  const overdue = open.filter((t) => t.dueAt !== null && t.dueAt < now).length;

  const out: string[] = [
    '---',
    `quest_log: ${MARKDOWN_FORMAT}`,
    `synced: ${localStamp(now)}`,
    `app: ${yamlValue(`quest_log ${source.version} (build ${source.build})`)}`,
    `open_quests: ${open.length}`,
    `completed_quests: ${completed.length}`,
    `overdue_quests: ${overdue}`,
    `level: ${level}`,
    `xp: ${state.progress.xp}`,
    `day_streak: ${currentDayStreak(state.progress, now)}`,
    'tags:',
    '  - quest_log',
    '---',
    '',
    '# quest_log',
    '',
    `> [!info] Synced from quest_log on ${dayKey(now)} at ${formatMinutes(minutesOfDay(now))}`,
    '> This note is a copy of the app, rewritten on every SYNC: change tasks in quest_log, not here.',
    '> Quests are checkboxes with their objectives nested under them. 📅 due date · 🕐 due time · ⏫ 🔼 🔽 priority (high, medium, low) · 🔁 repeats · ✅ completed on (the Obsidian Tasks plugin reads these).',
  ];

  for (const { key, label } of CATEGORIES) {
    const ids = questOrder(state, key).filter((id) => {
      const t = findTask(state, id);
      return !!t && !t.done && t.deletedAt === null && questCategory(t) === key;
    });
    out.push('', `## ${label}`, '');
    if (!ids.length) out.push('_Nothing open._');
    for (const id of ids) appendTask(state, id, 0, out);
  }

  out.push('', '## COMPLETED', '');
  if (!completed.length) out.push('_Nothing completed yet._');
  for (const t of completed) appendTask(state, t.id, 0, out);

  return `${out.join('\n')}\n`;
}
