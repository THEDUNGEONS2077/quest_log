/**
 * services/backup.ts: backup files on the phone (PLAN §9.17 "Data").
 *
 * Layer: services (native boundary: expo-file-system, expo-sharing). All
 * file access goes through Android's own pickers, so the app needs no
 * storage permission and only ever touches the one folder or file the
 * user chooses. Nothing is uploaded: "Share" hands the file to whichever
 * app the user picks.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { BACKUP_MAX_BYTES, BackupError } from '@/store/backup';

const MIME = 'application/json';

/** How Settings presents saving: a folder picker, plus a separate Share button. */
export const backupUi = { saveLabel: 'Save backup to a folder', separateShare: true } as const;

/**
 * Asks for a folder, then writes the backup there. Returns false if the
 * user cancelled the folder picker. Write errors are thrown.
 */
export async function saveBackupToFolder(json: string, fileName: string): Promise<boolean> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return false; // picker closed without choosing
  }
  const file = dir.createFile(fileName, MIME);
  file.write(json);
  return true;
}

/** Writes the backup to the app's cache and opens the share sheet for it. */
export async function shareBackup(json: string, fileName: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: 'Save quest_log backup' });
}

/**
 * Asks for a backup file and returns its text, or null if the user
 * cancelled. Throws BackupError for files that are too large.
 */
export async function pickBackupText(): Promise<string | null> {
  // Any type: phones label .json files inconsistently; the content is checked instead.
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  const file = picked.result;
  if ((file.size ?? 0) > BACKUP_MAX_BYTES) throw new BackupError('That file is too large to be a quest_log backup.');
  return file.text();
}
