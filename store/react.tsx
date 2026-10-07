/**
 * store/react.tsx: React bindings for the store, through context.
 *
 * Layer: store. Components get the store from context instead of importing
 * the app singleton, so tests can render them against an in-memory store
 * (store/index.ts imports MMKV, which needs native code). The app provides
 * the real store once, in app/_layout.tsx.
 */
import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';

import type { AppStore, AppStoreInstance } from './createStore';
import { makeSelectors } from './selectors';

/** What the context carries: a store and its memoized selectors. */
export interface StoreBundle {
  store: AppStoreInstance;
  selectors: ReturnType<typeof makeSelectors>;
}

const StoreContext = createContext<StoreBundle | null>(null);

/** Bundles a store with a fresh selector set. */
export function bundleStore(store: AppStoreInstance): StoreBundle {
  return { store, selectors: makeSelectors() };
}

/** Provides a store to everything below it. */
export function StoreProvider({ value, children }: { value: StoreBundle; children: ReactNode }) {
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** The store bundle from context. Throws if there's no provider (a setup bug). */
export function useStoreBundle(): StoreBundle {
  const bundle = useContext(StoreContext);
  if (!bundle) throw new Error('useStoreBundle: no <StoreProvider> above this component');
  return bundle;
}

/**
 * Subscribe to a slice of the store. The component re-renders only when the
 * selected value changes (Object.is), so select narrowly (ARCHITECTURE.md §8):
 *   useAppStore((s) => findTask(s.tasks, id))   one row's task
 *   useAppStore((s) => s.editingId === id)      a boolean, not the whole id
 */
export function useAppStore<T>(selector: (s: AppStore) => T): T {
  return useStore(useStoreBundle().store, selector);
}

/** Actions and imperative reads (event handlers): `useActions().addTask(…)`. */
export function useActions(): AppStore {
  return useStoreBundle().store.getState();
}

/** The memoized selectors for the current store. */
export function useSelectors(): StoreBundle['selectors'] {
  return useStoreBundle().selectors;
}
