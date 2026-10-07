/**
 * __tests__/lib/ops.test.ts: tree mutations and their inverses (lib/ops.ts).
 *
 * The core contract (ARCHITECTURE.md §5): applying an op and then its
 * inverse restores the tree exactly. It's checked per builder below, and by
 * a seeded fuzz test that runs thousands of random ops while also checking
 * the tree invariants after every step.
 */
import { flattenActive } from '@/lib/flatten';
import { addTask, apply, editTask, indent, moveTask, newTask, type Op, outdent, restore, softDelete } from '@/lib/ops';
import { childIds, subtreeIds } from '@/lib/tree';
import { type ID, ROOT, type TasksState } from '@/lib/types';

import { build, ids, outline, shape, tk } from '../helpers/tree';

/** Applies an op, asserts its inverse restores the original, returns the new state. */
function applyAndCheckUndo(state: TasksState, op: Op): TasksState {
  const { state: next, inverse } = apply(state, op);
  const undone = apply(next, inverse);
  expect(shape(undone.state)).toEqual(shape(state));
  // Redo (re-applying the inverse of the inverse) reaches the same tree again.
  expect(shape(apply(undone.state, undone.inverse).state)).toEqual(shape(next));
  return next;
}

/** Tree invariants every op must preserve. */
function checkInvariants(s: TasksState): void {
  expect(s.children[ROOT]).toBeDefined();
  const seen = new Set<ID>();
  for (const [key, list] of Object.entries(s.children)) {
    if (key !== ROOT) {
      expect(list.length).toBeGreaterThan(0); // no empty lists except root
      expect(tk(s, key)).toBeDefined(); // parent exists
    }
    for (const id of list) {
      expect(seen.has(id)).toBe(false); // each task listed exactly once
      seen.add(id);
      expect(tk(s, id)!.parentId).toBe(key === ROOT ? null : key); // parentId matches its list
    }
  }
  expect(seen.size).toBe(ids(s).length); // no orphans
}

const base = () =>
  build([
    ['work', [['ship'], ['notes', [['draft'], ['proof']]]]],
    ['home', { collapsed: true }, [['bank']]],
  ]);

describe('apply', () => {
  it('bumps structureVersion only for structural changes', () => {
    const s = base();
    expect(apply(s, editTask(s, 'ship', { title: 'Ship it' }, 1)).state.structureVersion).toBe(0);
    expect(apply(s, editTask(s, 'ship', { done: true }, 1)).state.structureVersion).toBe(1);
  });

  it('keeps unchanged tasks identical (so their rows do not re-render)', () => {
    const s = base();
    const next = apply(s, editTask(s, 'draft', { title: 'x' }, 1)).state;
    expect(tk(next, 'home')).toBe(tk(s, 'home'));
    expect(tk(next, 'draft')).not.toBe(tk(s, 'draft'));
  });

  it('never mutates its input', () => {
    const s = base();
    const frozen = JSON.stringify(s);
    apply(s, moveTask(s, 'proof', null, 0, 1));
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('rejects moving a task into its own subtree', () => {
    const s = base();
    expect(() => apply(s, { type: 'move', id: 'work', parentId: 'draft', index: 0 })).toThrow(/own subtree/);
  });

  it('removes a subtree and restores it exactly on undo', () => {
    const s = base();
    const next = applyAndCheckUndo(s, { type: 'remove', id: 'notes' });
    expect(subtreeIds(next, 'work')).toEqual(['work', 'ship']);
    expect(tk(next, 'draft')).toBeUndefined();
    expect(next.children.notes).toBeUndefined();
  });
});

describe('builders', () => {
  it('addTask inserts at the end, touches ancestors and expands a collapsed parent', () => {
    const s = base();
    const next = applyAndCheckUndo(s, addTask(s, newTask('atm', 'home', 'ATM', 50)));
    expect(childIds(next, 'home')).toEqual(['bank', 'atm']);
    expect(tk(next, 'home')!.collapsed).toBe(false);
    expect(tk(next, 'home')!.updatedAt).toBe(50);
  });

  it('addTask inserts at a given index', () => {
    const s = base();
    const next = applyAndCheckUndo(s, addTask(s, newTask('first', null, 'first', 1), 0));
    expect(childIds(next, null)).toEqual(['first', 'work', 'home']);
  });

  it('editTask bubbles updatedAt to every ancestor (PLAN §7.1)', () => {
    const s = base();
    const next = applyAndCheckUndo(s, editTask(s, 'draft', { notes: 'hi' }, 77));
    expect(tk(next, 'draft')!.notes).toBe('hi');
    expect([tk(next, 'draft')!.updatedAt, tk(next, 'notes')!.updatedAt, tk(next, 'work')!.updatedAt]).toEqual([77, 77, 77]);
    expect(tk(next, 'ship')!.updatedAt).toBe(0); // siblings untouched
  });

  it('moveTask reorders within a parent', () => {
    const s = base();
    const next = applyAndCheckUndo(s, moveTask(s, 'proof', 'notes', 0, 1));
    expect(childIds(next, 'notes')).toEqual(['proof', 'draft']);
  });

  it('moveTask re-nests and touches old and new ancestors', () => {
    const s = base();
    const next = applyAndCheckUndo(s, moveTask(s, 'notes', 'home', 1, 9));
    expect(childIds(next, 'home')).toEqual(['bank', 'notes']);
    expect(tk(next, 'notes')!.parentId).toBe('home');
    expect(tk(next, 'work')!.updatedAt).toBe(9);
    expect(tk(next, 'home')!.updatedAt).toBe(9);
  });

  it('indent nests under the previous sibling; null when first', () => {
    const s = base();
    expect(indent(s, 'ship', 1)).toBeNull();
    const next = applyAndCheckUndo(s, indent(s, 'notes', 1)!);
    expect(outline(flattenActive(next))).toEqual(['work', '  ship', '    notes', '      draft', '      proof', 'home']);
  });

  it('indent under a collapsed task expands it', () => {
    const s = build([['a', { collapsed: true }, [['a1']]], ['b']]);
    const next = applyAndCheckUndo(s, indent(s, 'b', 1)!);
    expect(outline(flattenActive(next))).toEqual(['a', '  a1', '  b']);
  });

  it('outdent places the task right after its parent; null at top level', () => {
    const s = base();
    expect(outdent(s, 'work', 1)).toBeNull();
    const next = applyAndCheckUndo(s, outdent(s, 'draft', 1)!);
    expect(childIds(next, 'work')).toEqual(['ship', 'notes', 'draft']);
  });

  it('softDelete hides a subtree in place; restore brings it back to the same spot', () => {
    const s = base();
    const deleted = applyAndCheckUndo(s, softDelete(s, 'notes', 5));
    expect(outline(flattenActive(deleted))).toEqual(['work', '  ship', 'home']);
    const back = applyAndCheckUndo(deleted, restore(deleted, 'notes', 6));
    expect(outline(flattenActive(back))).toEqual(outline(flattenActive(s)));
  });
});

describe('fuzz: random op sequences', () => {
  /** Small deterministic PRNG (mulberry32), so failures reproduce. */
  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it.each([1, 2, 3, 4, 5])('seed %i: 400 ops keep invariants and undo exactly', (seed) => {
    const rand = rng(seed);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    let s = build([]);
    let nextId = 0;

    for (let step = 0; step < 400; step++) {
      const all = ids(s);
      const at = step + 1;
      let op: Op | null = null;
      const kind = all.length < 3 ? 0 : Math.floor(rand() * 7);

      if (kind === 0) {
        // Add under a random parent (or top level) at a random index.
        const parent = all.length && rand() < 0.7 ? pick(all) : null;
        const index = Math.floor(rand() * (childIds(s, parent).length + 1));
        op = addTask(s, newTask(`t${nextId++}`, parent, 'x', at), index);
      } else if (kind === 1) {
        // Move to a random valid destination (not inside its own subtree).
        const id = pick(all);
        const own = new Set(subtreeIds(s, id));
        const targets = [null, ...all.filter((x) => !own.has(x))];
        const parent = pick(targets);
        const len = childIds(s, parent).filter((x) => x !== id).length;
        op = moveTask(s, id, parent, Math.floor(rand() * (len + 1)), at);
      } else if (kind === 2) op = indent(s, pick(all), at);
      else if (kind === 3) op = outdent(s, pick(all), at);
      else if (kind === 4) op = editTask(s, pick(all), { done: rand() < 0.5, title: `s${step}` }, at);
      else if (kind === 5) op = softDelete(s, pick(all), at);
      else op = { type: 'remove', id: pick(all) };

      if (!op) continue; // indent/outdent not possible here
      s = applyAndCheckUndo(s, op);
      checkInvariants(s);
    }
  });
});
