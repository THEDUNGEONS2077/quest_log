/**
 * __tests__/lib/copy.test.ts: Duplicate and Copy as text (lib/copy.ts),
 * including the copy → paste round trip with lib/paste.ts.
 */
import { duplicate, toOutlineText } from '@/lib/copy';
import { flattenActive } from '@/lib/flatten';
import { apply } from '@/lib/ops';
import { parseOutline, pasteOp } from '@/lib/paste';
import type { TasksState } from '@/lib/types';

import { build, outline, shape, tk } from '../helpers/tree';

const s = build([
  [
    'trip',
    { notes: 'book early' },
    [
      ['flights', { done: true }],
      ['hotel', [['deposit']]],
      ['gone', { deletedAt: 1 }],
    ],
  ],
  ['other'],
]);

describe('duplicate', () => {
  it('copies the live subtree right below the original, as one undo step', () => {
    let n = 0;
    const { op, rootId } = duplicate(s, 'trip', 9, () => `d${n++}`);
    const r = apply(s, op);
    expect(shape(apply(r.state, r.inverse).state)).toEqual(shape(s));
    expect(outline(flattenActive(r.state))).toEqual([
      'trip',
      '  flights',
      '  hotel',
      '    deposit',
      'd0',
      '  d1',
      '  d2',
      '    d3',
      'other',
    ]);
    expect(tk(r.state, rootId)).toMatchObject({ title: 'trip', notes: 'book early', createdAt: 9 });
    expect(tk(r.state, 'd1')!.done).toBe(true); // done state carries over
  });
});

describe('toOutlineText', () => {
  it('writes an indented outline with checkboxes and notes', () => {
    expect(toOutlineText(s, 'trip')).toBe(['trip', '  // book early', '  - [x] flights', '  - [ ] hotel', '    - [ ] deposit'].join('\n'));
  });

  it('round-trips through paste', () => {
    const text = toOutlineText(s, 'trip');
    const empty = build([]);
    let n = 0;
    const { op } = pasteOp(empty, parseOutline(text), null, 0, 1, () => `p${n++}`);
    const pasted: TasksState = apply(empty, op).state;
    expect(toOutlineText(pasted, 'p0')).toBe(text);
  });
});
