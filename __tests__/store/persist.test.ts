/**
 * __tests__/store/persist.test.ts: loading, migrations, recovery, snapshots
 * and the throttled writer (store/persist.ts, store/migrations).
 *
 * Friends' data is real (PLAN §0), so every failure path must keep the
 * original bytes and still start the app.
 */
import { addTask, apply, editTask, newTask } from '@/lib/ops';
import { bucketOf } from '@/lib/taskMap';
import { createEmptyState, toDocument } from '@/lib/tree';
import { SCHEMA_VERSION } from '@/lib/types';
import { createMemoryKV } from '@/store/kv';
import { FutureSchemaError, MIGRATIONS, assertValidDocument, migrate } from '@/store/migrations';
import {
  createTasksSaver,
  createThrottledWriter,
  listDailySnapshots,
  loadJSON,
  loadTasks,
  localDateKey,
  saveTasks,
  takeDailySnapshot,
} from '@/store/persist';
import { repairDocument } from '@/store/repair';

import fixtureV1 from '../fixtures/tasks-v1.json';
import { build, ids, shape, tk } from '../helpers/tree';

const NOW = new Date(2026, 9, 7, 12).getTime();
const META = 'tasks.v1.meta';

describe('migrations', () => {
  it('has a migration for every version below the current one', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(MIGRATIONS[v]).toBeDefined();
  });

  it('loads the v1 fixture (saved beta data) into the current format', () => {
    const { doc } = migrate(structuredClone(fixtureV1));
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.byId.b!.title).toBe('Ship v2 build');
    expect(doc.byId.c!.repeat).toEqual({ freq: 'week', interval: 1, weekdays: [5], from: 'schedule' });
    expect(doc.children.a).toEqual(['b', 'c']);
  });

  it('refuses data from a newer app version', () => {
    expect(() => migrate({ ...fixtureV1, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(FutureSchemaError);
  });

  it('rejects structurally broken trees', () => {
    const broken = structuredClone(fixtureV1);
    broken.children.a = ['b']; // c is now in no list
    expect(() => assertValidDocument(broken)).toThrow(/not in any list/);
    const wrongParent = structuredClone(fixtureV1);
    (wrongParent.byId.b as { parentId: string | null }).parentId = null;
    expect(() => assertValidDocument(wrongParent)).toThrow(/parentId/);
  });
});

describe('loadTasks', () => {
  it('starts fresh when nothing is saved', () => {
    const r = loadTasks(createMemoryKV(), NOW);
    expect(r.status).toBe('fresh');
    expect(r.state).toEqual(createEmptyState());
  });

  it('round-trips saved data', () => {
    const kv = createMemoryKV();
    const s = build([['a', [['b']]]]);
    saveTasks(kv, s);
    const r = loadTasks(kv, NOW);
    expect(r.status).toBe('loaded');
    expect(r.state).toEqual(s);
  });

  it('keeps corrupt bytes and recovers from the newest valid snapshot', () => {
    const kv = createMemoryKV({
      [META]: '{ not json',
      'snapshot.2026-10-05': JSON.stringify(toDocument(build([['older']]))),
      'snapshot.2026-10-06': JSON.stringify(toDocument(build([['saved']]))),
    });
    const r = loadTasks(kv, NOW);
    expect(r.status).toBe('recovered-from-snapshot');
    expect(tk(r.state, 'saved')).toBeDefined();
    expect(JSON.parse(kv.getString(`corrupt.${NOW}`)!)[META]).toBe('{ not json'); // original kept
  });

  it('falls back to empty when no snapshot is usable, still keeping the bytes', () => {
    const kv = createMemoryKV({ [META]: '"just a string"' });
    const r = loadTasks(kv, NOW);
    expect(r.status).toBe('recovered-empty');
    expect(JSON.parse(kv.getString(`corrupt.${NOW}`)!)[META]).toBe('"just a string"');
  });

  it('does not allow writes over data from a newer app version', () => {
    const kv = createMemoryKV({ [META]: JSON.stringify({ children: { root: [] }, structureVersion: 0, schemaVersion: SCHEMA_VERSION + 1 }) });
    const r = loadTasks(kv, NOW);
    expect(r).toMatchObject({ writable: false, status: 'future-schema' });
  });
});

describe('incremental saving', () => {
  it('rewrites only the buckets that changed, and meta only on structural change', () => {
    const kv = createMemoryKV();
    let s = build([['a'], ['b'], ['c']]);
    saveTasks(kv, s);
    const writes: string[] = [];
    // Records every key written, then passes the write through.
    const spy = { ...kv, set: (k: string, v: string) => (writes.push(k), kv.set(k, v)) };
    const spySave = createTasksSaver(spy, s);

    // A title edit: exactly one bucket key, no meta.
    s = apply(s, editTask(s, 'b', { title: 'B!' }, 1)).state;
    spySave(s);
    expect(writes).toEqual([`tasks.v1.b.${bucketOf('b')}`]);

    // A structural change (new task) writes meta too.
    writes.length = 0;
    s = apply(s, addTask(s, newTask('d', null, 'd', 2))).state;
    spySave(s);
    expect(writes).toContain(META);
  });

  it('round-trips through the bucketed layout', () => {
    const kv = createMemoryKV();
    const s = build([['a', [['b', { notes: 'x' }]]], ['c', { done: true }]]);
    saveTasks(kv, s);
    expect(shape(loadTasks(kv, NOW).state)).toEqual(shape(s));
  });
});

describe('repair (interrupted saves)', () => {
  it('re-attaches a task that was saved but not yet listed', () => {
    const doc = toDocument(build([['a'], ['b']]));
    doc.children = { root: ['a'] }; // meta written before b was listed
    const { doc: fixed, repaired } = repairDocument(doc);
    expect(repaired).toBe(true);
    expect(fixed.children.root).toEqual(['a', 'b']);
    expect(() => assertValidDocument(fixed)).not.toThrow();
  });

  it('drops list entries for tasks that were not saved, and fixes parentIds', () => {
    const doc = toDocument(build([['a', [['b']]]]));
    doc.children = { root: ['a', 'ghost'], a: ['b'] };
    doc.byId.b = { ...doc.byId.b!, parentId: null };
    const { doc: fixed } = repairDocument(doc);
    expect(fixed.children.root).toEqual(['a']);
    expect(fixed.byId.b!.parentId).toBe('a');
  });

  it('breaks parent cycles by moving to top level', () => {
    const doc = toDocument(build([['a', [['b']]]]));
    doc.children = { root: [], a: ['b'], b: ['a'] };
    doc.byId.a = { ...doc.byId.a!, parentId: 'b' };
    const { doc: fixed } = repairDocument(doc);
    expect(() => assertValidDocument(fixed)).not.toThrow();
    expect(fixed.children.root!.length).toBeGreaterThan(0);
  });

  it('loads a half-saved tree as "repaired" instead of discarding it', () => {
    const kv = createMemoryKV();
    saveTasks(kv, build([['a']]));
    // Simulate: a new task's bucket was written, then the app died before meta.
    kv.set(`tasks.v1.b.${bucketOf('new')}`, JSON.stringify({ new: newTask('new', null, 'new', 1) }));
    const r = loadTasks(kv, NOW);
    expect(r.status).toBe('repaired');
    expect(ids(r.state)).toEqual(['a', 'new']);
  });
});

describe('daily snapshots', () => {
  it('writes one per day and keeps the newest 3', () => {
    const kv = createMemoryKV();
    const s = build([['a']]);
    const day = 86_400_000;
    for (let i = 0; i < 5; i++) expect(takeDailySnapshot(kv, s, NOW + i * day)).toBe(true);
    // Snapshots are flat documents (readable, and loadable by migrate()).
    expect(JSON.parse(kv.getString('snapshot.2026-10-11')!).byId.a).toBeDefined();
    expect(takeDailySnapshot(kv, s, NOW + 4 * day + 1000)).toBe(false); // same day again
    expect(listDailySnapshots(kv)).toEqual(['snapshot.2026-10-11', 'snapshot.2026-10-10', 'snapshot.2026-10-09']);
  });

  it('formats local date keys', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('createThrottledWriter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('collapses a burst of changes into one trailing write', () => {
    const write = jest.fn();
    const w = createThrottledWriter(write, 300);
    for (let i = 0; i < 50; i++) w.markDirty();
    expect(write).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately and only when something is pending', () => {
    const write = jest.fn();
    const w = createThrottledWriter(write, 300);
    w.flush();
    expect(write).not.toHaveBeenCalled();
    w.markDirty();
    w.flush();
    expect(write).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1); // the timer was cancelled by flush
  });
});

describe('loadJSON', () => {
  it('fills defaults for missing fields and ignores garbage', () => {
    const kv = createMemoryKV({ ok: '{"a":5}', bad: 'nope' });
    expect(loadJSON(kv, 'ok', { a: 1, b: 2 })).toEqual({ a: 5, b: 2 });
    expect(loadJSON(kv, 'bad', { a: 1 })).toEqual({ a: 1 });
    expect(loadJSON(kv, 'missing', { a: 1 })).toEqual({ a: 1 });
  });
});
