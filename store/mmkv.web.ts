/**
 * store/mmkv.web.ts: the KV for the web build / iPhone PWA (native version:
 * mmkv.ts).
 *
 * Layer: store. react-native-mmkv's web version stores keys in the browser's
 * localStorage (same API, same `quest_log` instance id). Two web-specific
 * safeguards:
 *   - Browsers allow about 5 MB per site. If a write doesn't fit, the daily
 *     safety snapshots (snapshot.*) are dropped to make room, then the write
 *     is retried: the live tasks always win over the extra copies.
 *   - It asks the browser to keep the storage permanently (not evict it
 *     under storage pressure). Installed iPhone home-screen apps already are.
 */
import { createMMKV } from 'react-native-mmkv';

import { KEYS, type KV } from './kv';

/** The app's storage (same instance id as native: changing it would orphan existing data). */
export function createAppKV(): KV {
  const mmkv = createMMKV({ id: 'quest_log' });

  // Best effort; browsers that don't support it simply ignore the request.
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) void navigator.storage.persist().catch(() => {});

  return {
    getString: (k) => mmkv.getString(k),
    set: (k, v) => {
      try {
        mmkv.set(k, v);
      } catch {
        // Probably over quota: free the snapshot copies (never the key being written), then retry once.
        for (const key of mmkv.getAllKeys()) if (key.startsWith(KEYS.snapshotPrefix) && key !== k) mmkv.remove(key);
        mmkv.set(k, v);
      }
    },
    remove: (k) => {
      mmkv.remove(k);
    },
    getAllKeys: () => mmkv.getAllKeys(),
  };
}
