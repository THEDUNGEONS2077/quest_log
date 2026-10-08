/**
 * components/common/useMinute.ts: a shared, minute-aligned clock for the UI.
 *
 * Layer: UI. Time-relative labels ("17:00", "TOMORROW", OVERDUE, header
 * counts) must update as time passes, and render functions must stay pure
 * (no Date.now() during render). Components call useMinute() to get the
 * current minute's timestamp and re-render when it changes.
 *
 * One timer serves every subscriber, and it runs only while something is
 * subscribed. It fires just after each minute boundary, so labels flip on
 * the minute instead of up to a minute late.
 */
import { useSyncExternalStore } from 'react';

const MINUTE = 60_000;

/** Start of the current minute (epoch ms). */
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;

let minute = currentMinute();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Schedules the next tick just after the coming minute boundary. */
function schedule() {
  const delay = minute + MINUTE - Date.now() + 50;
  timer = setTimeout(
    () => {
      minute = currentMinute();
      listeners.forEach((l) => l());
      schedule();
    },
    Math.max(delay, 0),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    // First subscriber: catch up (the app may have been asleep), then start ticking.
    minute = currentMinute();
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** The current minute (epoch ms); the component re-renders each minute. */
export function useMinute(): number {
  return useSyncExternalStore(subscribe, () => minute);
}

/** No-op subscription for components that don't need the clock right now. */
const subscribeNever = () => () => {};

/**
 * The current minute, but only subscribed while `enabled`: a row without a
 * due date shouldn't re-render every minute. Returns the last known minute
 * otherwise.
 */
export function useMinuteIf(enabled: boolean): number {
  return useSyncExternalStore(enabled ? subscribe : subscribeNever, () => minute);
}
