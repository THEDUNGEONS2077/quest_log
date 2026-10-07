/**
 * store/index.ts: the app's single store instance and React hooks.
 *
 * Layer: store. Importing this module hydrates the store synchronously from
 * MMKV (that's intended: the data is ready before the first render) and
 * starts persistence.
 *
 * Usage in components (subscribe narrowly; ARCHITECTURE.md §8):
 *   const task = useAppStore((s) => findTask(s.tasks, id));  // one row
 *   const rows = useAppStore(selectors.activeRows);          // the list
 *   const addTask = useAppStore((s) => s.addTask);           // actions are stable
 */
import { randomUUID } from 'expo-crypto';
import { useStore } from 'zustand';

import { type AppStore, createAppStore, installPersistence } from './createStore';
import { createAppKV } from './mmkv';
import { makeSelectors } from './selectors';

/** The MMKV-backed key-value store. */
export const kv = createAppKV();

/** The app store, hydrated synchronously right here. */
export const appStore = createAppStore({ kv, now: Date.now, newId: randomUUID });

/** Persistence runs for the app's whole lifetime; the teardown is unused. */
installPersistence(appStore, kv);

/** Memoized derived data for the app store. */
export const selectors = makeSelectors();

/** React hook: subscribe to a slice of the store. Re-renders only when the slice changes. */
export function useAppStore<T>(selector: (s: AppStore) => T): T {
  return useStore(appStore, selector);
}

export type { AppStore } from './createStore';
