/**
 * __tests__/lib/purge.test.ts: Trash expiry (lib/purge.ts).
 */
import { apply } from '@/lib/ops';
import { purgeExpiredTrash } from '@/lib/purge';

import { build, ids } from '../helpers/tree';

const DAY = 86_400_000;
const NOW = 100 * DAY;

describe('purgeExpiredTrash', () => {
  it('returns null when nothing has expired', () => {
    expect(purgeExpiredTrash(build([['a', { deletedAt: NOW - DAY }]]), NOW)).toBeNull();
  });

  it('removes tasks deleted more than 7 days ago, with their subtrees', () => {
    const s = build([['old', { deletedAt: NOW - 8 * DAY }, [['kid', { deletedAt: NOW - 9 * DAY }]]], ['keep']]);
    const op = purgeExpiredTrash(s, NOW)!;
    // Only the expired root is removed explicitly; its expired child goes with it.
    expect(op).toEqual({ type: 'batch', ops: [{ type: 'remove', id: 'old' }] });
    expect(ids(apply(s, op).state)).toEqual(['keep']);
  });

  it('removes an expired task inside a live parent', () => {
    const s = build([['live', [['gone', { deletedAt: NOW - 30 * DAY }], ['stay']]]]);
    const next = apply(s, purgeExpiredTrash(s, NOW)!).state;
    expect(next.children.live).toEqual(['stay']);
  });
});
