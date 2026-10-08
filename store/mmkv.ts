/**
 * store/mmkv.ts: the MMKV-backed KV used by the app (see store/kv.ts).
 *
 * Layer: store. MMKV is synchronous (PLAN §4): reads happen before the
 * first render with no hydration flash, and writes are fast. Imported by
 * store/index.ts and by the widget's headless task (which reads its small
 * snapshot without loading the whole store). Tests use createMemoryKV
 * instead, because react-native-mmkv needs its native module.
 */
import { createMMKV } from 'react-native-mmkv';

import type { KV } from './kv';

/**
 * The app's MMKV instance. The `id` is fixed: changing it would orphan
 * every existing user's data.
 */
export function createAppKV(): KV {
  const mmkv = createMMKV({ id: 'quest_log' });
  return {
    getString: (k) => mmkv.getString(k),
    set: (k, v) => mmkv.set(k, v),
    remove: (k) => {
      mmkv.remove(k);
    },
    getAllKeys: () => mmkv.getAllKeys(),
  };
}
