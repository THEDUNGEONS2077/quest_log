/**
 * store/index.ts: the app's single store instance.
 *
 * Layer: store. Importing this module hydrates the store synchronously from
 * MMKV (intended: the data is ready before the first render) and starts
 * persistence. Only app/_layout.tsx imports it, to hand the store to
 * <StoreProvider>; components use the hooks in store/react.tsx.
 */
import { randomUUID } from 'expo-crypto';

import { createAppStore, installPersistence } from './createStore';
import { createAppKV } from './mmkv';
import { bundleStore } from './react';

/** The MMKV-backed key-value store. */
export const kv = createAppKV();

/** The app store, hydrated synchronously right here. */
export const appStore = createAppStore({ kv, now: Date.now, newId: randomUUID });

/** Persistence runs for the app's whole lifetime; the teardown is unused. */
installPersistence(appStore, kv);

/** The store plus its memoized selectors, for <StoreProvider value={appBundle}>. */
export const appBundle = bundleStore(appStore);
