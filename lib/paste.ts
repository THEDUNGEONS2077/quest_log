/**
 * lib/paste.ts: turns pasted multiline text into a task tree (PLAN §9.3).
 *
 * Layer: pure lib.
 *
 * Each non-empty line becomes a task. Leading whitespace sets the nesting,
 * and common list markers are stripped:
 *
 *   Groceries              → Groceries
 *     - milk               →   milk
 *     - [x] eggs           →   eggs (done)
 *   * Call the bank        → Call the bank
 *
 * The indent unit is detected from the text (the smallest non-zero indent;
 * a tab counts as one unit), so 2-space, 4-space and tab outlines all work.
 */
import { newTask, type Op, receiveChildChanges } from './ops';
import type { ID, TasksState } from './types';

/** One parsed line. */
export interface PastedLine {
  title: string;
  /** Nesting level, 0 = same level as the paste target. */
  depth: number;
  done: boolean;
  /** Lines starting with `//` right after a task become its notes (Copy as text writes them). */
  notes: string;
}

/** Max title length (PLAN §9.3). Longer pasted lines are cut. */
export const TITLE_MAX = 500;

// Leading list markers: "- ", "* ", "• ", "+ ", "1. ", "1) ", then an optional checkbox "[ ]" / "[x]".
const BULLET = /^(?:[-*•+]|\d+[.)])\s+/;
const CHECKBOX = /^\[([ xX])\]\s*/;

/** Parses pasted text into lines with depth and done state. Empty lines are skipped. */
export function parseOutline(text: string): PastedLine[] {
  const raw = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '');

  // Measure each line's indent in columns (tab = 1 unit, resolved below).
  const measured = raw.map((line) => {
    const ws = /^[\t ]*/.exec(line)![0];
    const tabs = (ws.match(/\t/g) ?? []).length;
    return { line, tabs, spaces: ws.length - tabs };
  });

  // Indent unit = the smallest non-zero space indent (default 2).
  const spaceIndents = measured.map((m) => m.spaces).filter((n) => n > 0);
  const unit = spaceIndents.length ? Math.min(...spaceIndents) : 2;

  const lines: PastedLine[] = [];
  let prevDepth = -1;
  for (const { line, tabs, spaces } of measured) {
    // `// text` belongs to the task above, as a notes line.
    const trimmed = line.trim();
    if (trimmed.startsWith('//') && lines.length) {
      const prev = lines[lines.length - 1]!;
      const note = trimmed.slice(2).trim();
      prev.notes = prev.notes ? `${prev.notes}\n${note}` : note;
      continue;
    }
    let rest = trimmed.replace(BULLET, '');
    let done = false;
    const box = CHECKBOX.exec(rest);
    if (box) {
      done = box[1] !== ' ';
      rest = rest.slice(box[0].length);
    }
    if (!rest) continue; // a bare marker like "-" isn't a task
    // Clamp: a line can be at most one level deeper than the line before it.
    const wanted = tabs + Math.round(spaces / unit);
    const depth = Math.min(wanted, prevDepth + 1);
    lines.push({ title: rest.slice(0, TITLE_MAX), depth, done, notes: '' });
    prevDepth = depth;
  }
  return lines;
}

/**
 * Builds one undoable op that inserts the parsed lines under `parentId`,
 * starting at `index` (depth 0 lines become siblings there; deeper lines
 * nest under the line above). `newId` supplies an ID per task. Returns the
 * op and the IDs of the created tasks in order.
 */
export function pasteOp(
  state: TasksState,
  lines: readonly PastedLine[],
  parentId: ID | null,
  index: number,
  at: number,
  newId: () => ID,
): { op: Op; ids: ID[] } {
  const ops: Op[] = [];
  const ids: ID[] = [];
  // stack[d] = the ID of the most recent task at depth d.
  const stack: ID[] = [];
  let nextIndex = index;
  // Children are appended to the end of a freshly created parent, so we
  // track each new parent's child count instead of reading state.
  const childCount = new Map<ID, number>();

  for (const line of lines) {
    const parent = line.depth === 0 ? parentId : stack[line.depth - 1]!;
    const id = newId();
    const task = { ...newTask(id, parent, line.title, at), done: line.done, doneAt: line.done ? at : null, notes: line.notes };
    if (line.depth === 0) {
      ops.push({ type: 'insert', parentId: parent, index: nextIndex++, tasks: [task], children: {} });
    } else {
      const n = childCount.get(parent!) ?? 0;
      ops.push({ type: 'insert', parentId: parent, index: n, tasks: [task], children: {} });
      childCount.set(parent!, n + 1);
    }
    stack[line.depth] = id;
    stack.length = line.depth + 1;
    ids.push(id);
  }

  // Touch (and expand) the target parent once, the same way addTask does.
  if (parentId !== null && ids.length) {
    ops.push({ type: 'update', changes: receiveChildChanges(state, parentId, at) });
  }
  return { op: { type: 'batch', ops }, ids };
}
