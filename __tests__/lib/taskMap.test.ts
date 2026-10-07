/**
 * __tests__/lib/taskMap.test.ts: the bucketed task map (lib/taskMap.ts).
 */
import { newTask } from '@/lib/ops';
import {
  BUCKET_COUNT,
  bucketOf,
  bucketsFromRecord,
  emptyBuckets,
  findTask,
  recordFromBuckets,
  taskCount,
  withTasks,
  withoutTasks,
} from '@/lib/taskMap';

const task = (id: string) => newTask(id, null, id, 0);

describe('bucketOf', () => {
  it('maps the last two hex digits of a UUID directly', () => {
    expect(bucketOf('3f2a9c1e-0000-4000-8000-0000000000ff')).toBe(255);
    expect(bucketOf('3f2a9c1e-0000-4000-8000-000000000000')).toBe(0);
    expect(bucketOf('3f2a9c1e-0000-4000-8000-0000000000A1')).toBe(0xa1); // uppercase too
  });

  it('spreads random UUIDs evenly over all buckets', () => {
    const counts = new Array(BUCKET_COUNT).fill(0);
    for (let i = 0; i < 25_600; i++) counts[bucketOf(crypto.randomUUID())]++;
    // 100 expected per bucket; allow generous random variation.
    expect(Math.min(...counts)).toBeGreaterThan(50);
    expect(Math.max(...counts)).toBeLessThan(160);
  });

  it('falls back to a hash for non-hex IDs, always in range and stable', () => {
    for (const id of ['a', 'work', 'x-y-z', '']) {
      const b = bucketOf(id);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(BUCKET_COUNT);
      expect(bucketOf(id)).toBe(b);
    }
  });
});

describe('copy-on-write updates', () => {
  it('copies only touched buckets; others keep their identity', () => {
    const before = bucketsFromRecord({ a: task('a'), work: task('work') });
    const after = withTasks(before, [{ ...task('a'), title: 'changed' }]);
    expect(findTask({ buckets: after }, 'a')!.title).toBe('changed');
    expect(findTask({ buckets: before }, 'a')!.title).toBe('a'); // input untouched
    const changed = after.filter((b, i) => b !== before[i]);
    expect(changed).toHaveLength(1);
  });

  it('removes tasks and returns emptied buckets to the shared empty bucket', () => {
    const one = withTasks(emptyBuckets(), [task('a')]);
    const none = withoutTasks(one, ['a']);
    expect(taskCount({ buckets: none })).toBe(0);
    expect(none[bucketOf('a')]).toBe(emptyBuckets()[0]);
  });

  it('round-trips a flat record', () => {
    const record = { a: task('a'), b: task('b'), c: task('c') };
    expect(recordFromBuckets(bucketsFromRecord(record))).toEqual(record);
  });
});
