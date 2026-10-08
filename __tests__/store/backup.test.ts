/**
 * __tests__/store/backup.test.ts: reading backups back (store/backup.ts)
 * and the Data actions (import, snapshots, restore, auto-clear at launch).
 */
import { makeBackup } from '@/lib/backup';
import { childIds, toDocument } from '@/lib/tree';
import { SCHEMA_VERSION } from '@/lib/types';
import { BackupError, parseBackup } from '@/store/backup';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV, type KV } from '@/store/kv';
import { saveTasks } from '@/store/persist';

import { build, tk } from '../helpers/tree';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 8, 12).getTime();
const APP = { version: '0.12.0', build: 18 };

function makeStore(kv: KV = createMemoryKV()) {
  return createAppStore({ kv, now: () => NOW, newId: () => 'x' });
}

describe('parseBackup', () => {
  const doc = toDocument(build([['a', [['b']]]]));

  it('reads a backup file and a bare tree document', () => {
    expect(parseBackup(JSON.stringify(makeBackup(doc, 5, APP)))).toMatchObject({ exportedAt: 5 });
    expect(parseBackup(JSON.stringify(doc)).exportedAt).toBeNull();
    expect(Object.keys(parseBackup(JSON.stringify(doc)).doc.byId).sort()).toEqual(['a', 'b']);
  });

  it('explains files it can’t use, in plain words', () => {
    const fail = (text: string) => {
      try {
        parseBackup(text);
      } catch (e) {
        expect(e).toBeInstanceOf(BackupError);
        return (e as Error).message;
      }
      throw new Error('expected a BackupError');
    };
    expect(fail('not json')).toMatch(/isn’t valid JSON/);
    expect(fail('{"hello":1}')).toMatch(/isn’t a quest_log backup/);
    expect(fail(JSON.stringify({ ...makeBackup(doc, 5, APP), version: 99 }))).toMatch(/newer quest_log/);
    expect(fail(JSON.stringify(makeBackup({ ...doc, schemaVersion: SCHEMA_VERSION + 1 }, 5, APP)))).toMatch(/newer quest_log/);
    expect(fail(JSON.stringify({ ...makeBackup(doc, 5, APP), tasks: { schemaVersion: SCHEMA_VERSION, byId: null } }))).toMatch(/damaged/);
  });

  it('repairs what the startup repair pass would (a listed task that is missing)', () => {
    const fixed = parseBackup(JSON.stringify(makeBackup({ ...doc, children: { ...doc.children, root: ['a', 'ghost'] } }, 5, APP)));
    expect(fixed.doc.children.root).toEqual(['a']);
  });
});

describe('Data actions', () => {
  it('import replace and merge are each one undo step, with a toast', () => {
    const kv = createMemoryKV();
    saveTasks(kv, build([['mine']]));
    const store = makeStore(kv);
    const doc = toDocument(build([['theirs', [['sub']]]]));

    expect(store.getState().importTasks(doc, 'merge')).toBe(2);
    expect(childIds(store.getState().tasks, null)).toEqual(['mine', 'theirs']);
    expect(store.getState().toast).toMatchObject({ message: 'ADDED 2 TASKS', undo: true });
    store.getState().undo();
    expect(childIds(store.getState().tasks, null)).toEqual(['mine']);

    store.getState().importTasks(doc, 'replace');
    expect(childIds(store.getState().tasks, null)).toEqual(['theirs']);
    expect(store.getState().toast?.message).toBe('REPLACED FROM BACKUP');
    store.getState().undo();
    expect(childIds(store.getState().tasks, null)).toEqual(['mine']);
  });

  it('says so when a merge has nothing new', () => {
    const kv = createMemoryKV();
    saveTasks(kv, build([['mine']]));
    const store = makeStore(kv);
    expect(store.getState().importTasks(store.getState().exportDocument(), 'merge')).toBe(0);
    expect(store.getState().toast).toMatchObject({ message: 'NOTHING NEW TO ADD', undo: false });
  });

  it('lists readable daily snapshots, newest first, and restores one (undoable)', () => {
    const kv = createMemoryKV({
      'snapshot.2026-10-07': JSON.stringify(toDocument(build([['yesterday']]))),
      'snapshot.2026-10-06': '{broken',
    });
    saveTasks(kv, build([['today']]));
    const store = makeStore(kv);
    const list = store.getState().listSnapshots();
    expect(list.map((s) => s.date)).toEqual(['2026-10-07']);
    expect(list[0]!.counts).toMatchObject({ active: 1 });

    expect(store.getState().restoreSnapshot('snapshot.2026-10-07')).toBe(true);
    expect(childIds(store.getState().tasks, null)).toEqual(['yesterday']);
    expect(store.getState().toast?.message).toBe('RESTORED 2026-10-07');
    store.getState().undo();
    expect(childIds(store.getState().tasks, null)).toEqual(['today']);
    expect(store.getState().restoreSnapshot('snapshot.2026-10-06')).toBe(false);
  });

  it('auto-clear moves old completed tasks to Trash at launch, per the setting', () => {
    const tree = () =>
      build([
        ['old', { done: true, updatedAt: NOW - 40 * DAY }],
        ['recent', { done: true, updatedAt: NOW - 5 * DAY }],
        ['open', { updatedAt: NOW - 40 * DAY }],
      ]);
    const off = createMemoryKV();
    saveTasks(off, tree());
    expect(tk(makeStore(off).getState().tasks, 'old')!.deletedAt).toBeNull();

    const on = createMemoryKV({ 'settings.v1': JSON.stringify({ autoClearCompleted: 30 }) });
    saveTasks(on, tree());
    const tasks = makeStore(on).getState().tasks;
    expect(tk(tasks, 'old')!.deletedAt).toBe(NOW);
    expect(tk(tasks, 'recent')!.deletedAt).toBeNull();
    expect(tk(tasks, 'open')!.deletedAt).toBeNull();
  });
});
