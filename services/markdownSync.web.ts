/**
 * services/markdownSync.web.ts: Markdown sync in the web build (native
 * version: markdownSync.ts).
 *
 * Layer: services (browser boundary). Browsers can't keep writing to a file
 * in a folder the user picked, so the web build doesn't offer SYNC
 * (Settings hides it: `markdownSyncSupported`). The same names exist so the
 * screens compile for both.
 */
import type { MarkdownTarget } from '@/store/settings';

/** A sync that can't proceed; `message` is shown in Settings as it is. */
export class MarkdownSyncError extends Error {}

/** No Markdown sync on the web. */
export const markdownSyncSupported = false;

/** Not available on the web. */
export async function setUpMarkdownSync(_text: string, _now: number): Promise<MarkdownTarget | null> {
  throw new MarkdownSyncError('MARKDOWN SYNC NEEDS THE ANDROID APP.');
}

/** Not available on the web. */
export function syncMarkdown(_target: MarkdownTarget, _text: string, _now: number): MarkdownTarget {
  throw new MarkdownSyncError('MARKDOWN SYNC NEEDS THE ANDROID APP.');
}
