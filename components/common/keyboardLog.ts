/**
 * components/common/keyboardLog.ts: a short in-memory log of keyboard
 * events, for the developer screen (bug 2026-10-11: the "> new quest" bar
 * stuck mid-screen "every now and then", which can't be reproduced off the
 * phone).
 *
 * Layer: UI. Keeps the last LOG_SIZE entries: what each keyboard tracker
 * reported (the keyboard library, React Native's own), quick-add focus,
 * the app going to the background and back, and every correction the
 * sticky bar made. Nothing is saved or sent anywhere: it lives in memory
 * until the app closes, and the developer screen shows it (long-press the
 * title) so it can be read or copied right after the bug shows up.
 */

/** How many entries are kept (the oldest drop off). */
const LOG_SIZE = 150;

interface Entry {
  /** Milliseconds since the app started. */
  at: number;
  what: string;
}

const started = Date.now();
const entries: Entry[] = [];

/** Adds one line to the log. */
export function logKeyboard(what: string): void {
  entries.push({ at: Date.now() - started, what });
  if (entries.length > LOG_SIZE) entries.shift();
}

/** The log as text, newest last: "12.345s  what happened". */
export function keyboardLogText(): string {
  return entries.map((e) => `${(e.at / 1000).toFixed(3)}s  ${e.what}`).join('\n');
}

/** Empties the log (developer screen). */
export function clearKeyboardLog(): void {
  entries.length = 0;
}
