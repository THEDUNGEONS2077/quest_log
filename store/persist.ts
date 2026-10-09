/**
 * store/persist.ts: loading and saving app data in MMKV (PLAN §7.3).
 *
 * Layer: store. ARCHITECTURE.md §6.
 *
 * Storage layout for tasks (changed from PLAN's single key on 2026-10-07,
 * for the §5 budgets):
 *   tasks.v1.meta      { children, structureVersion, schemaVersion, progress }
 *   tasks.v1.b.<n>     one bucket of tasks (lib/taskMap.ts), only if non-empty
 * A save re-serializes only the buckets whose contents changed (identity
 * check), so a keystroke writes about 30 tasks instead of all of them.
 * Buckets are written before meta, and load runs a repair pass, so an
 * interrupted save can't lose tasks (store/repair.ts).
 *
 * Startup (all synchronous, before the first render):
 *   1. assemble the flat document from meta + buckets,
 *   2. if it's an old format, keep a pre-migration snapshot, then migrate,
 *   3. repair, then validate,
 *   4. if anything is unreadable, keep the raw data under `corrupt.<time>`
 *      (never overwrite it) and fall back to the newest daily snapshot.
 *
 * Saving: throttled to one write per 300 ms (trailing edge), and flushed
 * when the app leaves the foreground. A daily snapshot of the whole
 * document is kept for 3 days.
 */
import type { Bucket } from '@/lib/taskMap';
import { createEmptyState, fromDocument, toDocument } from '@/lib/tree';
import { SCHEMA_VERSION, type TasksDocument, type TasksState } from '@/lib/types';

import { KEYS, type KV } from './kv';
import { FutureSchemaError, assertValidDocument, migrate } from './migrations';
import { repairDocument } from './repair';

/** Write throttle window (PLAN §7.3). */
export const PERSIST_THROTTLE_MS = 300;
/** Daily snapshots kept (PLAN §7.3). */
export const SNAPSHOTS_KEPT = 3;

const META_KEY = `${KEYS.tasks}.meta`;
const BUCKET_PREFIX = `${KEYS.tasks}.b.`;

/** Outcome of loading tasks, for diagnostics and recovery messages. */
export interface LoadResult {
  state: TasksState;
  /**
   * False when saved data comes from a newer app version: the app runs on
   * an empty tree and must not overwrite the newer data.
   */
  writable: boolean;
  status: 'fresh' | 'loaded' | 'migrated' | 'repaired' | 'recovered-from-snapshot' | 'recovered-empty' | 'future-schema';
}

/** Keys of all saved task buckets. */
function bucketKeys(kv: KV): string[] {
  return kv.getAllKeys().filter((k) => k.startsWith(BUCKET_PREFIX));
}

/**
 * Loads the task tree (startup steps 1–4 above). Never throws: every
 * failure path keeps the original bytes and returns something usable.
 */
export function loadTasks(kv: KV, now: number): LoadResult {
  const metaRaw = kv.getString(META_KEY);
  const keys = bucketKeys(kv);
  if (metaRaw === undefined && keys.length === 0) return { state: createEmptyState(), writable: true, status: 'fresh' };

  try {
    // 1. Assemble one flat document from meta + every bucket key.
    const meta = JSON.parse(metaRaw ?? 'null') as Omit<TasksDocument, 'byId'> | null;
    if (!meta) throw new Error('missing meta');
    const byId = {};
    for (const k of keys) Object.assign(byId, JSON.parse(kv.getString(k) ?? '{}'));
    const doc = { ...meta, byId };

    // 2. Keep the exact pre-migration data before running any migration.
    if (typeof meta.schemaVersion === 'number' && meta.schemaVersion < SCHEMA_VERSION) {
      kv.set(`${KEYS.snapshotPrefix}premigration.v${meta.schemaVersion}`, JSON.stringify(doc));
    }
    const migrated = migrate(doc);

    // 3. Repair what an interrupted save could leave behind, then validate.
    const { doc: fixed, repaired } = repairDocument(migrated.doc);
    assertValidDocument(fixed);
    const status = migrated.migrated ? 'migrated' : repaired ? 'repaired' : 'loaded';
    return { state: fromDocument(fixed), writable: true, status };
  } catch (e) {
    if (e instanceof FutureSchemaError) {
      return { state: createEmptyState(), writable: false, status: 'future-schema' };
    }
    // 4. Unreadable: preserve every raw value, then try the newest snapshot.
    const raw: Record<string, string | undefined> = { [META_KEY]: metaRaw };
    for (const k of keys) raw[k] = kv.getString(k);
    kv.set(`${KEYS.corruptPrefix}${now}`, JSON.stringify(raw));
    return recoverFromSnapshot(kv);
  }
}

/** Loads the newest daily snapshot that migrates and validates; empty if none does. */
function recoverFromSnapshot(kv: KV): LoadResult {
  for (const key of listDailySnapshots(kv)) {
    try {
      const { doc } = migrate(JSON.parse(kv.getString(key) ?? ''));
      const { doc: fixed } = repairDocument(doc);
      assertValidDocument(fixed);
      return { state: fromDocument(fixed), writable: true, status: 'recovered-from-snapshot' };
    } catch {
      // Try the next older snapshot.
    }
  }
  return { state: createEmptyState(), writable: true, status: 'recovered-empty' };
}

/**
 * Creates the incremental task saver. It remembers what it last wrote and
 * re-serializes only buckets whose identity changed (ops copy a bucket only
 * when a task in it changes). Pass `written` = the state that's already on
 * disk (the loaded state); pass null to force one full write, which also
 * removes stale bucket keys (after a recovery or migration).
 */
export function createTasksSaver(kv: KV, written: TasksState | null) {
  let lastBuckets: readonly Bucket[] | null = written?.buckets ?? null;
  let lastMeta: TasksState | null = written;

  return function save(state: TasksState): void {
    // Buckets first, meta last: if the app dies in between, repair can fix
    // the result without losing a task (store/repair.ts).
    for (let i = 0; i < state.buckets.length; i++) {
      const bucket = state.buckets[i]!;
      if (lastBuckets && lastBuckets[i] === bucket) continue;
      if (Object.keys(bucket).length === 0) kv.remove(`${BUCKET_PREFIX}${i}`);
      else kv.set(`${BUCKET_PREFIX}${i}`, JSON.stringify(bucket));
    }
    // Meta changes only with structure (children or versions) or XP, never on keystrokes.
    if (
      !lastMeta ||
      lastMeta.children !== state.children ||
      lastMeta.structureVersion !== state.structureVersion ||
      lastMeta.schemaVersion !== state.schemaVersion ||
      lastMeta.progress !== state.progress
    ) {
      const { children, structureVersion, schemaVersion, progress } = state;
      kv.set(META_KEY, JSON.stringify({ children, structureVersion, schemaVersion, progress }));
    }
    lastBuckets = state.buckets;
    lastMeta = state;
  };
}

/** Writes the whole tree (used by tests and tools; the app uses createTasksSaver). */
export function saveTasks(kv: KV, state: TasksState): void {
  // Remove every existing bucket key first, then write the full tree.
  for (const k of bucketKeys(kv)) kv.remove(k);
  createTasksSaver(kv, null)(state);
}

/** Local date as YYYY-MM-DD (for snapshot keys). */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Daily snapshot keys, newest first (pre-migration snapshots excluded). */
export function listDailySnapshots(kv: KV): string[] {
  const pattern = new RegExp(`^${KEYS.snapshotPrefix.replace('.', '\\.')}\\d{4}-\\d{2}-\\d{2}$`);
  return kv
    .getAllKeys()
    .filter((k) => pattern.test(k))
    .sort()
    .reverse();
}

/**
 * Takes today's safety snapshot (the whole tree as one document) if there
 * isn't one yet, then deletes all but the newest SNAPSHOTS_KEPT. It's a
 * full serialization, so the store runs it a few seconds after startup
 * rather than before the first render. Returns true if a snapshot was written.
 */
export function takeDailySnapshot(kv: KV, state: TasksState, now: number): boolean {
  const key = `${KEYS.snapshotPrefix}${localDateKey(now)}`;
  if (kv.getString(key) !== undefined) return false;
  kv.set(key, JSON.stringify(toDocument(state)));
  for (const old of listDailySnapshots(kv).slice(SNAPSHOTS_KEPT)) kv.remove(old);
  return true;
}

/** Timer functions, injectable so tests can use fake timers. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** A trailing-edge throttled writer. */
export interface Writer {
  /** Note that data changed; a write happens at most PERSIST_THROTTLE_MS later. */
  markDirty(): void;
  /** Write now if anything is pending (going to background, before export). */
  flush(): void;
  /** Drop any pending write (tests, teardown). */
  cancel(): void;
}

/**
 * Creates a throttled writer. `write` reads the *current* state when it
 * runs, so a burst of changes produces one write of the latest data.
 */
export function createThrottledWriter(write: () => void, ms = PERSIST_THROTTLE_MS, timers: Timers = defaultTimers): Writer {
  let handle: unknown = null;
  const run = () => {
    handle = null;
    write();
  };
  return {
    markDirty() {
      // Already scheduled: this change will be included in that write.
      if (handle === null) handle = timers.setTimeout(run, ms);
    },
    flush() {
      if (handle === null) return;
      timers.clearTimeout(handle);
      run();
    },
    cancel() {
      if (handle !== null) timers.clearTimeout(handle);
      handle = null;
    },
  };
}

/**
 * Loads a small JSON object (settings, UI state) and fills in defaults for
 * missing or unreadable fields, so adding a new setting needs no migration.
 */
export function loadJSON<T extends object>(kv: KV, key: string, defaults: T): T {
  const raw = kv.getString(key);
  if (raw === undefined) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...defaults, ...(parsed as Partial<T>) } : defaults;
  } catch {
    return defaults;
  }
}
