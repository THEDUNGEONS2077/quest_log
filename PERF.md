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
| JS bundle (Hermes) | < 2.5 MB | | | |
| Release APK (arm64) | < 25 MB | | | |
| Installed size | < 40 MB | | | |
| Memory, 1,000 tasks | < 150 MB | | | |

## Measurements

### v0.1.0 (build 1), 2026-10-07: Phase 1 pipeline check (theme screen only, no task data)
- Release APK: **31 MB, over the 25 MB budget.** About 18 MB of it is uncompressed native libraries.
- JS bundle: **2.9 MB, over the 2.5 MB budget.**
- Both are flagged for Phase 2. The release manifest also has unwanted storage and SYSTEM_ALERT_WINDOW permissions from library manifests; these get removed in Phase 2 too.
