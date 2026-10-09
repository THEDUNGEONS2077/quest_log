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
    // The copy is the newest quest, so it shows first (quests display newest-modified first).
    expect(outline(flattenActive(r.state))).toEqual([
      'd0',
      '  d1',
      '  d2',
      '    d3',
      'trip',
      '  flights',
      '  hotel',
      '    deposit',
      'other',
    ]);
    // Stored right below the original.
    expect(r.state.children.root).toEqual(['trip', 'd0', 'other']);
    expect(tk(r.state, rootId)).toMatchObject({ title: 'trip', notes: 'book early', createdAt: 9 });
    expect(tk(r.state, 'd1')!.done).toBe(true); // done state carries over
  });
});

describe('toOutlineText', () => {
  it('writes an indented outline with checkboxes and notes', () => {
    // Objectives are written as saved, with a capital first letter (lib/title.ts).
    expect(toOutlineText(s, 'trip')).toBe(['trip', '  // book early', '  - [x] Flights', '  - [ ] Hotel', '    - [ ] Deposit'].join('\n'));
  });

  it('copies objectives as saved, not with every word capitalized as they are shown', () => {
    const t = build([['q', [['buy oat milk']]]]);
    expect(toOutlineText(t, 'q')).toBe(['q', '  - [ ] Buy oat milk'].join('\n'));
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
