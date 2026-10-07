/**
 * scripts/seed.ts: generates the performance test data set (PLAN §5).
 *
 *   - 1,000 active tasks nested up to 4 levels deep (about 300 of them
 *     under expanded parents),
 *   - 5,000 completed top-level tasks,
 *   - random notes, priorities, due dates and repeats.
 *
 * Deterministic: the same seed always gives the same tree, so performance
 * numbers are comparable between runs. Used by __tests__/perf.test.ts and by
 * the dev-only "LOAD SEED" button on the debug screen. It's pure (no
 * React, no native code), so it also runs in Node.
 */
import { newTask } from '@/lib/ops';
import { fromDocument, parentKey } from '@/lib/tree';
import { type ID, type ParentKey, type Priority, type RepeatRule, ROOT, SCHEMA_VERSION, type Task, type TasksState } from '@/lib/types';

export interface SeedOptions {
  active?: number;
  completed?: number;
  maxDepth?: number;
  /** PRNG seed; change it for a different (still deterministic) tree. */
  seed?: number;
  /** "Now", around which due dates and completion times are placed. */
  now?: number;
}

const WORDS = ['ship', 'review', 'call', 'draft', 'fix', 'buy', 'plan', 'write', 'test', 'clean', 'book', 'send', 'renew', 'check', 'update', 'release', 'bank', 'notes', 'trip', 'build'];
const REPEATS: RepeatRule[] = [
  { freq: 'day', interval: 1, from: 'schedule' },
  { freq: 'week', interval: 1, weekdays: [1, 4], from: 'schedule' },
  { freq: 'month', interval: 1, from: 'completion' },
];
const DAY = 86_400_000;

/** mulberry32: a tiny, fast, deterministic PRNG returning [0, 1). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds the seed tree. IDs are `seed-000000`, `seed-000001`, …, so they're stable too. */
export function generateSeed(options: SeedOptions = {}): TasksState {
  const { active = 1000, completed = 5000, maxDepth = 4, seed = 42, now = Date.UTC(2026, 9, 7, 12) } = options;
  const rand = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  // Built as a flat record first, then bucketed once at the end.
  const byId: Record<ID, Task> = {};
  const children: Record<ParentKey, ID[]> = { [ROOT]: [] };
  let n = 0;

  /** Creates one task with random optional fields and appends it under its parent. */
  const make = (parentId: ID | null, done: boolean): Task => {
    // Hex-style IDs ending in varying hex digits, like real UUIDs, so tasks
    // spread over buckets the way production data does (lib/taskMap.ts).
    const id = `seed-${(n++).toString(16).padStart(6, '0')}`;
    const createdAt = now - Math.floor(rand() * 60 * DAY);
    const t = newTask(id, parentId, `${pick(WORDS)} ${pick(WORDS)} ${n}`, createdAt);
    if (rand() < 0.2) t.notes = `note for ${id}\nsecond line with a link https://example.com/${n}`;
    t.priority = (rand() < 0.3 ? Math.ceil(rand() * 3) : 0) as Priority;
    if (rand() < 0.25) {
      t.dueAt = now + Math.floor((rand() - 0.3) * 14 * DAY);
      t.notify = rand() < 0.5;
      if (rand() < 0.2) t.repeat = pick(REPEATS);
    }
    if (done) {
      t.done = true;
      t.doneAt = now - Math.floor(rand() * 90 * DAY);
    }
    t.updatedAt = done ? t.doneAt! : createdAt;
    byId[id] = t;
    const key = parentKey(parentId);
    (children[key] ??= []).push(id);
    return t;
  };

  // Active tree: grow by attaching each new task to a random existing open
  // task (or top level), within maxDepth. This gives a realistic mix of
  // wide and deep groups.
  const open: { id: ID; depth: number }[] = [];
  for (let i = 0; i < active; i++) {
    const parent = open.length && rand() < 0.75 ? pick(open) : null;
    const depth = parent ? parent.depth + 1 : 0;
    if (parent && depth >= maxDepth) {
      i--;
      continue;
    }
    // Some subtasks are done: they stay visible, struck through.
    const t = make(parent?.id ?? null, parent !== null && rand() < 0.15);
    open.push({ id: t.id, depth });
  }
  // Collapse about 70% of parents, so roughly 300 rows show when fully loaded.
  for (const { id } of open) if (children[id] && rand() < 0.7) byId[id]!.collapsed = true;

  // Completed: top-level done tasks, some with a few done subtasks.
  for (let i = 0; i < completed; i++) {
    const t = make(null, true);
    if (rand() < 0.1) for (let k = 0; k < 3; k++) make(t.id, true);
  }
  return fromDocument({ byId, children, structureVersion: 0, schemaVersion: SCHEMA_VERSION });
}
