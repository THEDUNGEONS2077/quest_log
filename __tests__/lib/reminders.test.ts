/**
 * __tests__/lib/reminders.test.ts: desired reminders, reconciliation
 * (lib/reminders.ts) and external ops (lib/externalOps.ts).
 */
import { parseQueue, toOp } from '@/lib/externalOps';
import { apply } from '@/lib/ops';
import { desiredReminders, reconcile, reminderId, SNOOZE_MS, taskIdOf } from '@/lib/reminders';

import { build, tk } from '../helpers/tree';

const NOW = 1_000_000;
const s = build([
  [
    'work',
    [
      ['ship', { dueAt: NOW + 60_000, notify: true }],
      ['quiet', { dueAt: NOW + 30_000, notify: false }],
    ],
  ],
  ['past', { dueAt: NOW - 1, notify: true }],
  ['done', { dueAt: NOW + 5_000, notify: true, done: true }],
  ['trash', { deletedAt: 1 }, [['inside', { dueAt: NOW + 5_000, notify: true }]]],
  ['soon', { dueAt: NOW + 10_000, notify: true }],
]);

describe('desiredReminders', () => {
  it('includes only open, live, future tasks with notify on, soonest first', () => {
    const r = desiredReminders(s, NOW);
    expect(r.map((x) => x.taskId)).toEqual(['soon', 'ship']);
    expect(r[1]).toMatchObject({ identifier: `task:ship:${NOW + 60_000}`, title: 'ship', body: 'work' });
  });

  it('caps the count (iOS limit)', () => {
    expect(desiredReminders(s, NOW, 1)).toHaveLength(1);
  });

  it('skips tasks under a completed parent', () => {
    const g = build([['p', { done: true }, [['kid', { dueAt: NOW + 1, notify: true }]]]]);
    expect(desiredReminders(g, NOW)).toEqual([]);
  });
});

describe('reconcile', () => {
  const desired = desiredReminders(s, NOW);

  it('schedules what is missing and cancels what is stale, ignoring foreign identifiers', () => {
    const scheduled = [reminderId('soon', NOW + 10_000), reminderId('ship', NOW + 99), 'some-other-app-notification'];
    const plan = reconcile(desired, scheduled);
    expect(plan.cancel).toEqual([reminderId('ship', NOW + 99)]);
    expect(plan.schedule.map((r) => r.taskId)).toEqual(['ship']);
  });

  it('is a no-op when everything already matches (safe to run repeatedly)', () => {
    expect(
      reconcile(
        desired,
        desired.map((r) => r.identifier),
      ),
    ).toEqual({ cancel: [], schedule: [] });
  });

  it('parses task IDs back out of identifiers, including IDs with dashes', () => {
    expect(taskIdOf('task:3f2a-9c1e:123')).toBe('3f2a-9c1e');
    expect(taskIdOf('nope')).toBeNull();
  });
});

describe('external ops', () => {
  it('complete checks the task (with cascade rules) and is idempotent', () => {
    const op = toOp(s, { kind: 'complete', taskId: 'soon', at: NOW, source: 'notification' })!;
    const next = apply(s, op).state;
    expect(tk(next, 'soon')!.done).toBe(true);
    expect(toOp(next, { kind: 'complete', taskId: 'soon', at: NOW, source: 'notification' })).toBeNull();
  });

  it('snooze moves the due time 15 minutes past the tap, and is idempotent', () => {
    const ext = { kind: 'snooze' as const, taskId: 'past', at: NOW, source: 'notification' as const };
    const next = apply(s, toOp(s, ext)!).state;
    expect(tk(next, 'past')).toMatchObject({ dueAt: NOW + SNOOZE_MS, notify: true });
    expect(toOp(next, ext)).toBeNull();
  });

  it('ignores missing or trashed tasks', () => {
    expect(toOp(s, { kind: 'complete', taskId: 'ghost', at: NOW, source: 'widget' })).toBeNull();
    expect(toOp(s, { kind: 'complete', taskId: 'trash', at: NOW, source: 'widget' })).toBeNull();
  });

  it('parses the stored queue defensively', () => {
    expect(parseQueue(undefined)).toEqual([]);
    expect(parseQueue('garbage')).toEqual([]);
    expect(parseQueue(JSON.stringify([{ kind: 'complete', taskId: 'a', at: 1 }, { kind: 'explode' }]))).toHaveLength(1);
  });
});
