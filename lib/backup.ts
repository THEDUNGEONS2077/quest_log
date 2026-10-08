/**
 * lib/backup.ts: backup files, and the ops that bring one back
 * (PLAN §9.17 "Data").
 *
 * Layer: pure lib. A backup is a JSON file the user saves wherever they
 * like (the app never sends it anywhere). Reading one back (migrate,
 * repair, validate) lives in store/backup.ts, next to the same pipeline
 * used at startup.
 *
 * Bringing tasks back is an ordinary op, so it's one undo step:
 *   - replace: every current top-level subtree is removed and the
 *     backup's are inserted (the `remove` inverses restore the old tree
 *     exactly, so UNDO brings everything back),
 *   - merge:   only tasks the app doesn't have yet are added (matched by
 *     ID), under their original parent when it exists here, else at the
 *     top level. Merging the same backup twice adds nothing.
 */
import type { Op } from './ops';
import { childIds } from './tree';
import { findTask } from './taskMap';
import { ROOT, type ID, type ParentKey, type Task, type TasksDocument, type TasksState } from './types';

/** Identifies a quest_log backup file. */
export const BACKUP_FORMAT = 'quest_log-backup';
/** Version of the file layout (the task data inside has its own schemaVersion). */
export const BACKUP_VERSION = 1;

/** The file's contents. */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** When it was made (epoch ms). */
  exportedAt: number;
  /** Which app build made it, for support questions. */
  app: { version: string; build: number };
  /** The whole tree, Trash included. */
  tasks: TasksDocument;
}

/** Builds a backup of `doc`. */
export function makeBackup(doc: TasksDocument, now: number, app: { version: string; build: number }): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, app, tasks: doc };
}

/** "quest_log-backup-2026-10-08-1430.json" (local time; sorts by date). */
export function backupFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `quest_log-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** What a tree holds, for the import and restore previews. */
export interface DocCounts {
  /** Open top-level tasks (the ACTIVE tab count). */
  active: number;
  /** Done top-level tasks (the COMPLETED tab count). */
  completed: number;
  /** Tasks in Trash (deleted, not yet purged), counting each deleted task once. */
  trash: number;
  /** Every task, subtasks included. */
  total: number;
}

/** Counts a document's tasks (see DocCounts). */
export function countDocument(doc: TasksDocument): DocCounts {
  const counts: DocCounts = { active: 0, completed: 0, trash: 0, total: 0 };
  for (const t of Object.values(doc.byId)) {
    counts.total++;
    if (t.deletedAt !== null) {
      // Only the top of a deleted subtree is "in Trash"; its children go with it.
      const parent = t.parentId === null ? null : doc.byId[t.parentId];
      if (!parent || parent.deletedAt === null) counts.trash++;
    } else if (t.parentId === null) {
      if (t.done) counts.completed++;
      else counts.active++;
    }
  }
  return counts;
}

/** The insert op for `rootId`'s subtree from `doc`, skipping any task `skip` says to (with its subtree). */
function insertSubtree(doc: TasksDocument, rootId: ID, parentId: ID | null, index: number, skip: (id: ID) => boolean): Op {
  const tasks: Task[] = [];
  const children: Record<ID, ID[]> = {};
  // Iterative pre-order walk: the root first, as the insert op expects.
  const stack: ID[] = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    tasks.push(doc.byId[id]!);
    const kids = (doc.children[id as ParentKey] ?? []).filter((c) => !skip(c));
    if (kids.length) children[id] = kids;
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }
  return { type: 'insert', parentId, index, tasks, children };
}

/**
 * Replaces the whole tree with `doc`, as one undoable op. Returns null when
 * both are empty.
 */
export function replaceOp(state: TasksState, doc: TasksDocument): Op | null {
  const removes: Op[] = [...childIds(state, null)].reverse().map((id) => ({ type: 'remove', id }) as Op);
  const inserts: Op[] = (doc.children[ROOT] ?? []).map((id, i) => insertSubtree(doc, id, null, i, () => false));
  const ops = [...removes, ...inserts];
  return ops.length ? { type: 'batch', ops } : null;
}

/**
 * Adds the tasks from `doc` that `state` doesn't have, as one undoable op.
 * Returns null (and 0) when there's nothing new.
 */
export function mergeOp(state: TasksState, doc: TasksDocument): { op: Op | null; added: number } {
  const have = (id: ID) => findTask(state, id) !== undefined;
  const ops: Op[] = [];
  let added = 0;
  // New tasks are appended after each parent's existing children, in backup order.
  const nextIndex = new Map<ID | null, number>();

  // Walk the backup in tree order. A task we lack whose parent we have (or the
  // top level) starts a new subtree; tasks inside that subtree come with it.
  const walk = (parent: ID | null) => {
    for (const id of doc.children[parent ?? ROOT] ?? []) {
      if (!have(id)) {
        const target = parent !== null && have(parent) ? parent : null;
        const index = nextIndex.get(target) ?? childIds(state, target).length;
        nextIndex.set(target, index + 1);
        const op = insertSubtree(doc, id, target, index, have);
        if (op.type === 'insert') added += op.tasks.length;
        ops.push(op);
      } else {
        walk(id); // we have this one: look for new tasks inside it
      }
    }
  };
  walk(null);
  return { op: ops.length ? { type: 'batch', ops } : null, added };
}
