/**
 * __tests__/lib/widget.test.ts: the widget snapshot (lib/widget.ts):
 * which tasks, in what order, and the labels drawn from it.
 */
import { buildSnapshot, parseSnapshot, rowsForHeight, widgetDueLabel, withoutTask } from '@/lib/widget';

import { build } from '../helpers/tree';

const NOW = new Date(2026, 9, 8, 12).getTime();
const HOUR = 3_600_000;
const titles = (s: ReturnType<typeof buildSnapshot>) => s.tasks.map((t) => t.id);

describe('buildSnapshot', () => {
  it('orders overdue, then due today, then high priority, then list order', () => {
    const tasks = build([
      ['plain'],
      ['high', { priority: 3 }],
      ['later', { dueAt: NOW + 3 * HOUR }],
      ['tomorrow', { dueAt: NOW + 30 * HOUR }],
      ['late', { dueAt: NOW - HOUR }],
      ['soon', { dueAt: NOW + HOUR }],
      ['later-late', { dueAt: NOW - 2 * HOUR }],
    ]);
    expect(titles(buildSnapshot(tasks, NOW))).toEqual(['later-late', 'late', 'soon', 'later', 'high', 'plain', 'tomorrow']);
  });

  it('skips done, deleted and groups with open subtasks, but lists their open subtasks', () => {
    const tasks = build([
      ['work', [['ship'], ['done-sub', { done: true }]]],
      ['finished', { done: true }, [['inside', { done: true }]]],
      ['gone', { deletedAt: 5 }],
      ['all-done-group', [['x', { done: true }]]],
    ]);
    const s = buildSnapshot(tasks, NOW);
    expect(titles(s)).toEqual(['ship', 'all-done-group']);
    expect(s.active).toBe(2); // work + all-done-group
  });

  it('keeps at most the limit, and marks repeating tasks', () => {
    const tasks = build(Array.from({ length: 12 }, (_, i) => [`t${i}`] as [string]));
    expect(buildSnapshot(tasks, NOW).tasks).toHaveLength(8);
    expect(buildSnapshot(tasks, NOW, 3).tasks).toHaveLength(3);
    const rep = build([['r', { repeat: { freq: 'day', interval: 1, from: 'schedule' }, dueAt: NOW + HOUR }]]);
    expect(buildSnapshot(rep, NOW).tasks[0]).toMatchObject({ id: 'r', repeat: true });
  });
});

describe('snapshot helpers', () => {
  it('round-trips through JSON and rejects junk', () => {
    const s = buildSnapshot(build([['a']]), NOW);
    expect(parseSnapshot(JSON.stringify(s))).toEqual(s);
    expect(parseSnapshot(undefined)).toBeNull();
    expect(parseSnapshot('{oops')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ v: 2, tasks: [] }))).toBeNull();
  });

  it('withoutTask removes one row (the optimistic tap)', () => {
    const s = buildSnapshot(build([['a'], ['b']]), NOW);
    expect(withoutTask(s, 'a').tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('labels due times at draw time', () => {
    expect(widgetDueLabel(null, NOW)).toEqual({ text: '', overdue: false });
    expect(widgetDueLabel(NOW - 1, NOW)).toEqual({ text: 'OVERDUE', overdue: true });
    expect(widgetDueLabel(new Date(2026, 9, 8, 17).getTime(), NOW)).toEqual({ text: '17:00', overdue: false });
  });

  it('fits 3 rows small, 4 medium, 8 large', () => {
    expect(rowsForHeight(110)).toBe(3);
    expect(rowsForHeight(180)).toBe(4);
    expect(rowsForHeight(400)).toBe(8);
  });
});
