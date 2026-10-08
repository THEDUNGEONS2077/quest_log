/**
 * lib/changelog.ts: reads CHANGELOG.md into entries for the in-app
 * "What's new" screen (PLAN §9.19).
 *
 * Layer: pure lib, with no imports, so scripts/gen-changelog.mjs can load
 * it straight from Node (Node strips the types). The script writes the
 * result to assets/changelog.json, which the app bundles; a test checks
 * that file is up to date with CHANGELOG.md.
 *
 * Each section looks like:
 *
 *   ## 0.9.0 (build 15)
 *
 *   One-line summary.
 *
 *   - **Bold lead,** then text.
 *     - Nested point.
 */

export interface ChangelogEntry {
  version: string;
  build: number;
  /** The section's non-empty lines, as written (Markdown: `- ` bullets, `**bold**`, `` `code` ``). */
  lines: string[];
}

/** How many recent versions the app bundles (older ones stay on GitHub). */
export const CHANGELOG_KEEP = 6;

const HEADING = /^## (\S+) \(build (\d+)\)\s*$/;

/** Parses CHANGELOG.md, newest first (as written), keeping the latest `keep` versions. */
export function parseChangelog(md: string, keep: number = CHANGELOG_KEEP): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = HEADING.exec(raw);
    if (heading) {
      if (entries.length === keep) break;
      current = { version: heading[1]!, build: Number(heading[2]), lines: [] };
      entries.push(current);
    } else if (current && raw.trim() !== '') {
      current.lines.push(raw.trimEnd());
    }
  }
  return entries;
}

/**
 * The entries to show after an update: everything newer than the last build
 * seen, or just the current version when that's unknown. Empty when nothing
 * is new.
 */
export function entriesSince(entries: readonly ChangelogEntry[], lastSeenBuild: number | null, currentBuild: number): ChangelogEntry[] {
  if (lastSeenBuild !== null && lastSeenBuild >= currentBuild) return [];
  return entries.filter((e) => e.build <= currentBuild && (lastSeenBuild === null ? e.build === currentBuild : e.build > lastSeenBuild));
}
