/**
 * __tests__/lib/backup.test.ts: backup files and the import ops
 * (lib/backup.ts): counts, replace and merge, and that UNDO restores the
 * tree exactly.
 */
import { backupFileName, countDocument, makeBackup, mergeOp, replaceOp } from '@/lib/backup';
import { apply } from '@/lib/ops';
import { childIds, toDocument } from '@/lib/tree';

import { build, ids, shape, tk } from '../helpers/tree';

const current = () => build([['work', [['ship'], ['notes']]], ['home']]);
const backupTree = () =>
  build([['work', [['ship'], ['release', [['draft']]]]], ['gym'], ['old', { done: true }], ['bin', { deletedAt: 5 }, [['inside']]]]);

describe('backup files', () => {
  it('wraps the tree with format, version, date and app build', () => {
    const doc = toDocument(current());
    const file = makeBackup(doc, 1000, { version: '0.12.0', build: 18 });
    expect(file).toMatchObject({ format: 'quest_log-backup', version: 1, exportedAt: 1000, app: { build: 18 } });
    expect(file.tasks).toBe(doc);
  });

  it('names files by local date and time', () => {
    expect(backupFileName(new Date(2026, 9, 8, 14, 5).getTime())).toBe('quest_log-backup-2026-10-08-1405.json');
  });

  it('counts active, completed, trash (top of each deleted subtree) and total', () => {
    expect(countDocument(toDocument(backupTree()))).toEqual({ active: 2, completed: 1, trash: 1, total: 8 });
  });
});

describe('replaceOp', () => {
  it('swaps the whole tree, and its inverse restores the original exactly', () => {
    const before = current();
    const doc = toDocument(backupTree());
    const { state, inverse } = apply(before, replaceOp(before, doc)!);
    expect(shape(state)).toEqual(shape(backupTree()));
    expect(shape(apply(state, inverse).state)).toEqual(shape(before));
  });

  it('is null when both trees are empty', () => {
    expect(replaceOp(build([]), toDocument(build([])))).toBeNull();
  });
});

describe('mergeOp', () => {
  it('adds only tasks the app lacks, under existing parents, after existing children', () => {
    const before = current();
    const { op, added } = mergeOp(before, toDocument(backupTree()));
    expect(added).toBe(6); // release, draft, gym, old, bin, inside (work and ship exist)
    const { state, inverse } = apply(before, op!);
    expect(childIds(state, 'work')).toEqual(['ship', 'notes', 'release']);
    expect(childIds(state, 'release')).toEqual(['draft']);
    expect(childIds(state, null)).toEqual(['work', 'home', 'gym', 'old', 'bin']);
    expect(tk(state, 'old')!.done).toBe(true);
    expect(shape(apply(state, inverse).state)).toEqual(shape(before));
  });

  it('adds nothing the second time (merging is idempotent)', () => {
    const doc = toDocument(backupTree());
    const once = apply(current(), mergeOp(current(), doc).op!).state;
    expect(mergeOp(once, doc)).toEqual({ op: null, added: 0 });
  });

  it('keeps a task that exists elsewhere here where it is, and skips it inside a new subtree', () => {
    const before = build([['loose'], ['a']]);
    const doc = toDocument(build([['new', [['loose']]]]));
    const { op, added } = mergeOp(before, doc);
    const state = apply(before, op!).state;
    expect(added).toBe(1);
    expect(childIds(state, 'new')).toEqual([]);
    expect(ids(state)).toEqual(['a', 'loose', 'new']);
  });
});
