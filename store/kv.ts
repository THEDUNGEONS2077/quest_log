/**
 * store/kv.ts: the key-value storage interface used by persistence.
 *
 * Layer: store. persist.ts talks to this small interface instead of MMKV
 * directly, so its logic (throttling, snapshots, migrations) runs in plain
 * Jest tests against an in-memory map.
 *
 * The MMKV-backed implementation lives in store/mmkv.ts, which is kept
 * separate because importing react-native-mmkv loads a native module that
 * doesn't exist under Jest.
 */
/** The subset of MMKV the app uses. */
export interface KV {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
  getAllKeys(): string[];
}

/** All storage keys in one place (ARCHITECTURE.md §6). */
export const KEYS = {
  tasks: 'tasks.v1',
  settings: 'settings.v1',
  ui: 'ui.v1',
  /** First-run tips seen and the last "What's new" shown (store/onboarding.ts). */
  onboarding: 'onboarding.v1',
  opsPending: 'ops.pending',
  widgetSnapshot: 'widget.snapshot',
  /** Daily safety copies: `snapshot.YYYY-MM-DD`. */
  snapshotPrefix: 'snapshot.',
  /** Unreadable data is kept under this prefix instead of being overwritten. */
  corruptPrefix: 'corrupt.',
} as const;

/** In-memory KV for tests and tools. */
export function createMemoryKV(initial: Record<string, string> = {}): KV & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getString: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    getAllKeys: () => [...map.keys()],
    dump: () => Object.fromEntries(map),
  };
}
