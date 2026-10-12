/**
 * services/markdownSync.ts: the Markdown note (lib/markdown.ts) written to
 * a folder the user picks, then overwritten in place on every SYNC (user
 * request 2026-10-12: one file that Obsidian keeps reading, updated, not a
 * new file each time).
 *
 * Layer: services (native boundary: expo-file-system, Android's Storage
 * Access Framework). No storage permission is needed: the folder picker
 * grants access to that one folder, and expo-file-system keeps the grant
 * across restarts (it calls takePersistableUriPermission), so SYNC can write
 * there later without asking again. What's remembered is a MarkdownTarget,
 * kept in Settings on this phone (store/settings.ts).
 *
 * Overwriting: `File.write` opens a SAF file in mode "w", which on many
 * Android versions does NOT shorten the file, so a shorter note would leave
 * the old note's tail behind. Writes go through a handle opened with
 * FileMode.Truncate ("wt") instead, which empties the file first.
 */
import { Directory, File, FileMode } from 'expo-file-system';

import { MARKDOWN_FILE_NAME } from '@/lib/markdown';
import type { MarkdownTarget } from '@/store/settings';

/** A sync that can't proceed; `message` is shown in Settings as it is. */
export class MarkdownSyncError extends Error {}

/** Markdown sync works here (Android); the web build has no folders to write to. */
export const markdownSyncSupported = true;

// "application/octet-stream" keeps the name exactly as given: with a text type
// some phones append their own extension ("quest_log.md.txt").
const MIME = 'application/octet-stream';

/** The last part of a folder's SAF URI, readable ("…/tree/primary%3ADocuments%2FVault" → "Vault"). */
export function folderNameOf(uri: string): string {
  const path = decodeURIComponent(uri).replace(/\/+$/, '');
  return path.split(/[/:]/).pop() || 'the chosen folder';
}

/** Replaces the file's contents with `text` (truncating first; see the file header). */
function overwrite(file: File, text: string): void {
  const handle = file.open(FileMode.Truncate);
  try {
    handle.writeBytes(new TextEncoder().encode(text));
  } finally {
    handle.close();
  }
}

/** The note in `folder`: the existing quest_log.md (an earlier setup, a reinstall), else a new one. */
function noteIn(folder: Directory): File {
  const existing = folder.list().find((entry): entry is File => entry instanceof File && entry.name === MARKDOWN_FILE_NAME);
  return existing ?? folder.createFile(MARKDOWN_FILE_NAME, MIME);
}

/**
 * First time: asks for a folder (the Obsidian vault, say), writes the note
 * there and returns where it went. Null if the picker was closed. If the
 * folder already has a quest_log.md, that file is reused (updated), not
 * duplicated. Write errors throw MarkdownSyncError.
 */
export async function setUpMarkdownSync(text: string, now: number): Promise<MarkdownTarget | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return null; // picker closed without choosing
  }
  try {
    const file = noteIn(folder);
    overwrite(file, text);
    return { folderUri: folder.uri, fileUri: file.uri, folderName: folderNameOf(folder.uri), syncedAt: now };
  } catch {
    throw new MarkdownSyncError('COULDN’T WRITE IN THAT FOLDER. TRY ANOTHER ONE.');
  }
}

/**
 * SYNC: overwrites the note at `target` with `text`. If the file was
 * deleted or renamed meanwhile, a new quest_log.md is made in the same
 * folder. Returns the target as it is now (its file may have changed).
 * Throws MarkdownSyncError when the folder itself is gone or no longer
 * writable (then the user sets it up again).
 */
export function syncMarkdown(target: MarkdownTarget, text: string, now: number): MarkdownTarget {
  try {
    let file = new File(target.fileUri);
    if (!file.exists) {
      const folder = new Directory(target.folderUri);
      if (!folder.exists) throw new Error('folder gone'); // reported below, as any failure here
      file = noteIn(folder);
    }
    overwrite(file, text);
    return { ...target, fileUri: file.uri, syncedAt: now };
  } catch {
    throw new MarkdownSyncError(`CAN’T REACH THE FOLDER “${target.folderName}” ANY MORE. CHOOSE IT AGAIN WITH “Change folder”.`);
  }
}
