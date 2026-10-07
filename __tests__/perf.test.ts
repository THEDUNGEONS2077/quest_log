/**
 * __tests__/perf.test.ts: performance smoke tests on the seed data (PLAN §5).
 *
 * These run on a desktop CPU, which is several times faster than a
 * mid-range phone, so the limits here are deliberately set *below* the
 * phone budgets. They catch accidental O(n²) code early. Real numbers come
 * from the device in Phase 14 (PERF.md).
 */
import { flattenActive, flattenCompleted } from '@/lib/flatten';
import { apply, editTask } from '@/lib/ops';
import { toDocument } from '@/lib/tree';
import { createMemoryKV } from '@/store/kv';
import { createTasksSaver, saveTasks } from '@/store/persist';
import { computeCounts } from '@/store/selectors';

import { generateSeed } from '../scripts/seed';

import { allTasks, ids, tk } from './helpers/tree';

const seed = generateSeed();

/**
 * Average duration of `fn` in ms. The Jest environment's clock has only
 * 1 ms resolution, so it times batches of `batch` calls and takes the
 * median batch, divided by the batch size.
 */
function median(fn: () => void, runs = 9, batch = 20): number {
  fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    for (let j = 0; j < batch; j++) fn();
    times.push((performance.now() - t0) / batch);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(runs / 2)]!;
}

describe('seed data', () => {
  it('matches the PLAN §5 shape', () => {
    const top = seed.children.root!.map((id) => tk(seed, id)!);
    expect(top.filter((t) => t.done)).toHaveLength(5000);
    const all = allTasks(seed);
    // 1,000 active tasks (some done subtasks among them) + 5,000 completed (+ their subtasks).
    expect(all.filter((t) => !(t.parentId === null && t.done)).length).toBeGreaterThanOrEqual(1000);
    expect(generateSeed()).toEqual(seed); // deterministic
  });
});

describe('budgets (desktop smoke limits)', () => {
  it('flattens ACTIVE in well under a frame', () => {
    const rows = flattenActive(seed);
    expect(rows.length).toBeGreaterThan(100);
    expect(median(() => flattenActive(seed))).toBeLessThan(4);
  });

  it('flattens and sorts COMPLETED (5,000 tasks) quickly', () => {
    expect(median(() => flattenCompleted(seed))).toBeLessThan(8);
  });

  it('keystroke: a title edit op is far under the 4 ms JS budget', () => {
    const id = seed.children.root![0]!;
    expect(median(() => apply(seed, editTask(seed, id, { title: 'typing…' }, 1)))).toBeLessThan(1);
  });

  it('counts over all tasks quickly', () => {
    expect(median(() => computeCounts(seed, Date.now()))).toBeLessThan(4);
  });

  it('saves a keystroke incrementally (budget: < 8 ms on device)', () => {
    const kv = createMemoryKV();
    saveTasks(kv, seed);
    const save = createTasksSaver(kv, seed);
    const id = seed.children.root![0]!;
    let state = seed;
    let i = 0;
    // Each run: one title edit, then the incremental save of what changed.
    const ms = median(() => {
      state = apply(state, editTask(state, id, { title: `typing ${i++}` }, i)).state;
      save(state);
    });
    console.log(`keystroke edit + incremental save: ${ms.toFixed(2)} ms (desktop)`);
    expect(ms).toBeLessThan(1);
  });

  it('logs the full-document cost (daily snapshot, off the startup path)', () => {
    const doc = toDocument(seed);
    const ms = median(() => JSON.stringify(doc), 5, 2);
    console.log(`full snapshot: ${ids(seed).length} tasks, ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB, ${ms.toFixed(1)} ms (desktop)`);
    expect(ms).toBeLessThan(100);
  });
});
