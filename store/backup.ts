/**
 * store/backup.ts: reads backup files and daily snapshots back in
 * (PLAN §9.17 "Data").
 *
 * Layer: store. Uses the same pipeline as startup (store/persist.ts):
 * migrate an older schema, repair what an interrupted save could leave,
 * then validate the tree. Anything that fails gets a plain-language
 * message for the screen, and nothing in the app changes.
 *
 * Accepted inputs: a quest_log backup file (lib/backup.ts), or a bare
 * tree document (the format daily snapshots use).
 */
import { BACKUP_FORMAT, BACKUP_VERSION } from '@/lib/backup';
import type { TasksDocument } from '@/lib/types';

import { assertValidDocument, FutureSchemaError, migrate } from './migrations';
import { repairDocument } from './repair';

/** A backup that read cleanly, ready to preview and import. */
export interface ParsedBackup {
  doc: TasksDocument;
  /** When the backup was made, if the file says (bare documents don't). */
  exportedAt: number | null;
}

/** A backup that can't be used; `message` is shown to the user as is. */
export class BackupError extends Error {}

/** Largest file accepted (a 7,500-task tree is about 3 MB). */
export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;

/** Migrates, repairs and validates a tree document. Throws BackupError. */
export function readDocument(data: unknown): TasksDocument {
  try {
    const { doc } = migrate(data);
    const { doc: fixed } = repairDocument(doc);
    assertValidDocument(fixed);
    return fixed;
  } catch (e) {
    if (e instanceof FutureSchemaError) throw new BackupError('This backup is from a newer quest_log. Update the app, then try again.');
    throw new BackupError('This backup is damaged or incomplete, so it can’t be used.');
  }
}

/** Reads a backup file's text. Throws BackupError with a message for the user. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('That file isn’t a quest_log backup (it isn’t valid JSON).');
  }
  if (!data || typeof data !== 'object') throw new BackupError('That file isn’t a quest_log backup.');
  const file = data as Record<string, unknown>;

  // A quest_log backup file.
  if (file.format === BACKUP_FORMAT) {
    if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
      throw new BackupError('This backup is from a newer quest_log. Update the app, then try again.');
    }
    return { doc: readDocument(file.tasks), exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : null };
  }
  // A bare tree document (for example, a daily snapshot copied out).
  if ('byId' in file && 'children' in file && 'schemaVersion' in file) return { doc: readDocument(file), exportedAt: null };
  throw new BackupError('That file isn’t a quest_log backup.');
}
