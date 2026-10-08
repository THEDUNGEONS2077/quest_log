/**
 * services/backup.web.ts: backup files in the web build / iPhone PWA
 * (native version: backup.ts).
 *
 * Layer: services (browser boundary). Browsers can't write into a folder
 * the user picks, so:
 *   - saving hands the file to the system share sheet when the browser can
 *     share files (on an iPhone: "Save to Files", AirDrop, Mail…), else it
 *     downloads it,
 *   - importing uses a file chooser (<input type="file">).
 * Nothing is uploaded anywhere: the file only goes where the user sends it.
 */
import { BACKUP_MAX_BYTES, BackupError } from '@/store/backup';

const MIME = 'application/json';

/** On the web, saving already opens the share sheet, so Settings shows one button. */
export const backupUi = { saveLabel: 'Save backup…', separateShare: false } as const;

/** Shares the file if the browser can, else downloads it. Returns false if the user cancelled the share sheet. */
export async function saveBackupToFolder(json: string, fileName: string): Promise<boolean> {
  const file = new File([json], fileName, { type: MIME });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return true;
    } catch (e) {
      // AbortError = the user closed the sheet; anything else falls back to a download.
      if (e instanceof DOMException && e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before releasing the data.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Same as saving on the web (the share sheet is the save dialog). */
export async function shareBackup(json: string, fileName: string): Promise<void> {
  await saveBackupToFolder(json, fileName);
}

/**
 * Asks for a backup file and returns its text, or null if the user
 * cancelled. Throws BackupError for files that are too large.
 */
export function pickBackupText(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn();
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(() => resolve(null));
      if (file.size > BACKUP_MAX_BYTES) return finish(() => reject(new BackupError('That file is too large to be a quest_log backup.')));
      void file.text().then(
        (text) => finish(() => resolve(text)),
        () => finish(() => reject(new BackupError('That file couldn’t be read.'))),
      );
    });
    // Closing the chooser without a file (supported by current browsers).
    input.addEventListener('cancel', () => finish(() => resolve(null)));
    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
  });
}
