/**
 * lib/taskMap.ts: the bucketed task map behind `TasksState.buckets`.
 *
 * Layer: pure lib. Why buckets (decided 2026-10-07, see PLAN §7.1 note):
 * an immutable update of one flat map copies *every* entry. At 7,500 tasks
 * that copy alone costs about 2 ms on desktop (6–10 ms on a phone) per
 * keystroke, over the 4 ms budget. Splitting the map into 256 buckets by a
 * hash of the ID means an edit copies the 256-slot outer array plus one
 * bucket of about 30 tasks, roughly 50× less work. Persistence benefits the
 * same way: only changed buckets are re-serialized (store/persist.ts).
 *
 * All code reads and writes tasks through these functions, never by
 * indexing buckets directly, so the layout can change in one place.
 */
import type { ID, Task, TasksState } from './types';

/** Number of buckets. A power of two, so the hash can be masked. */
export const BUCKET_COUNT = 256;

/** One bucket: tasks keyed by ID. */
export type Bucket = Readonly<Record<ID, Task>>;

/** All empty buckets share this frozen object (copy-on-write). */
const EMPTY_BUCKET: Bucket = Object.freeze({});

/** Value of a hex digit's char code (0–15), or -1 if it isn't one. */
function hexValue(c: number): number {
  if (c >= 48 && c <= 57) return c - 48; // 0-9
  const lower = c | 32; // A-F → a-f
  return lower >= 97 && lower <= 102 ? lower - 87 : -1;
}

/**
 * Bucket index for an ID. Runs on every task lookup, so it must be cheap,
 * especially on Hermes (mostly interpreted).
 *
 * Fast path: real IDs are UUID v4s from expo-crypto, whose last two hex
 * digits are random, so they map straight onto 256 evenly used buckets with
 * no loop. Fallback for any other ID (tests, tools): FNV-1a over the string.
 *
 * Changing this function is safe for saved data: loading merges every saved
 * bucket regardless of its index (store/persist.ts).
 */
export function bucketOf(id: ID): number {
  const lo = hexValue(id.charCodeAt(id.length - 1));
  const hi = hexValue(id.charCodeAt(id.length - 2));
  if (lo >= 0 && hi >= 0) return hi * 16 + lo;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & (BUCKET_COUNT - 1);
}

/** BUCKET_COUNT empty buckets. */
export function emptyBuckets(): Bucket[] {
  return new Array<Bucket>(BUCKET_COUNT).fill(EMPTY_BUCKET);
}

/** The task with this ID, or undefined. */
export function findTask(state: Pick<TasksState, 'buckets'>, id: ID): Task | undefined {
  return state.buckets[bucketOf(id)]![id];
}

/**
 * Returns new buckets with `tasks` added or replaced. Copies the outer array
 * once and each touched bucket once; untouched buckets keep their identity.
 */
export function withTasks(buckets: readonly Bucket[], tasks: readonly Task[]): Bucket[] {
  const out = buckets.slice();
  const copied = new Set<number>();
  for (const t of tasks) {
    const b = bucketOf(t.id);
    // Copy each bucket only the first time it's touched in this call.
    if (!copied.has(b)) {
      out[b] = { ...out[b] };
      copied.add(b);
    }
    (out[b] as Record<ID, Task>)[t.id] = t;
  }
  return out;
}

/** Returns new buckets without the given IDs (same copy-once rule as withTasks). */
export function withoutTasks(buckets: readonly Bucket[], ids: readonly ID[]): Bucket[] {
  const out = buckets.slice();
  const copied = new Set<number>();
  for (const id of ids) {
    const b = bucketOf(id);
    if (!copied.has(b)) {
      out[b] = { ...out[b] };
      copied.add(b);
    }
    delete (out[b] as Record<ID, Task>)[id];
  }
  // Return emptied buckets to the shared empty object, so equal trees have equal shapes.
  for (const b of copied) if (Object.keys(out[b]!).length === 0) out[b] = EMPTY_BUCKET;
  return out;
}

/** Calls `fn` for every task (no particular order). */
export function forEachTask(state: Pick<TasksState, 'buckets'>, fn: (task: Task) => void): void {
  for (const bucket of state.buckets) for (const id in bucket) fn(bucket[id]!);
}

/** All tasks as an array (no particular order). */
export function allTasks(state: Pick<TasksState, 'buckets'>): Task[] {
  const out: Task[] = [];
  forEachTask(state, (t) => out.push(t));
  return out;
}

/** Number of tasks. */
export function taskCount(state: Pick<TasksState, 'buckets'>): number {
  let n = 0;
  for (const bucket of state.buckets) n += Object.keys(bucket).length;
  return n;
}

/** Builds buckets from a flat ID → task record (loading, tests). */
export function bucketsFromRecord(byId: Readonly<Record<ID, Task>>): Bucket[] {
  return withTasks(emptyBuckets(), Object.values(byId));
}

/** Flattens buckets into one ID → task record (backup, snapshots, tests). */
export function recordFromBuckets(buckets: readonly Bucket[]): Record<ID, Task> {
  return Object.assign({}, ...buckets) as Record<ID, Task>;
}
