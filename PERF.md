# Performance Log

PLAN §5 budgets, measured on a release build with `scripts/seed.ts` data (1,000 active + 5,000 completed tasks). The seed script arrives in Phase 3, and full measurements are taken in Phase 14.

| Metric | Budget | Measured | Build | Date |
|---|---|---|---|---|
| Cold start to interactive list | < 1.2 s | | | |
| Tap on task to keyboard open | < 100 ms | | | |
| Checkbox tap to visual response | ≤ 16 ms | | | |
| Scroll, 1,000 active / 300 expanded | 60 fps | | | |
| Scroll COMPLETED, 5,000 tasks | 60 fps | | | |
| Drag with 1,000 tasks | 60 fps | | | |
| Keystroke JS work | < 4 ms | | | |
| Persist write, 1,000 tasks | < 8 ms | | | |
| Tab switch | < 50 ms | | | |
| Widget refresh after change | < 2 s | | | |
| JS bundle (Hermes) | < 4.0 MB (was 2.5, then 3.5) | | | |
| Release APK (arm64) | < 25 MB | | | |
| Installed size | < 40 MB | | | |
| Memory, 1,000 tasks | < 150 MB | | | |

## Measurements

### v0.1.0 (build 1), 2026-10-07: Phase 1 pipeline check (theme screen only, no task data)
- Release APK: **31 MB, over the 25 MB budget.** About 18 MB of it is uncompressed native libraries.
- JS bundle: **2.9 MB, over the 2.5 MB budget.**
- Both are flagged for Phase 2. The release manifest also has unwanted storage and SYSTEM_ALERT_WINDOW permissions from library manifests; these get removed in Phase 2 too.

### Phase 2 fixes, 2026-10-07 (same theme screen)
- Release APK: **17.4 MB** (was 31 MB). Native libraries are now stored compressed (`useLegacyPackaging`). Installed size is still to be measured on the device.
- Permissions: only `VIBRATE`, plus AndroidX's private `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
- JS bundle: 2.9 MB, within the raised 3.5 MB budget. Expo Router is kept (user decision).

### v0.6.0 (build 8), 2026-10-08: reminders
- Release APK 19.2 MB (budget 25). JS bundle 3.40 MB (budget 3.5): expo-notifications, task-manager and the date picker added about 0.12 MB. Phases 8–13 will cross 3.5 MB; per the user's OK, the budget will be raised then, with the reason recorded.
- Release permissions: POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM, VIBRATE, WAKE_LOCK. Blocked: INTERNET, the Firebase push permissions, the install referrer, and 16 launcher badge permissions.

### v0.10.0 (build 16), 2026-10-08: polish (Phase 11)
- Release APK 20.3 MB (budget 25). JS bundle 3,668,908 bytes = **3.50 MiB**, right at the 3.5 budget. Phase 11 added about 30 KB: the boot screen, block cursor, glow, caret, onboarding, the What's new screen, its changelog data (about 6 KB, capped at the latest 6 versions) and the expo-quick-actions JS.
- **Budget raised to 4.0 MB**, with the user's standing OK. Why: Phase 12 (Android widget) and Phase 13 (settings, backup and import) add whole screens and native-module JS. The bundle is still mostly React Native, Expo Router and Reanimated. App code stays lean: every new module is used on device and there's no dead weight to cut.
- Permissions unchanged (7, no INTERNET); expo-quick-actions adds none.
