# quest_log: Architecture Framework

This is the rulebook for how quest_log's code is organized. **`PLAN.md`** says *what* the app does, and this file says *where code goes and how the pieces talk to each other*. Every phase follows it, and every phase updates it as code lands.

Status markers:
- **(built)** means the code exists.
- **(planned, Phase N)** means the rule is fixed but the code arrives in that phase.

---

## 1. Layers and dependency rules

```
┌────────────────────────────────────────────────────────────┐
│ UI          /app (screens)  /components (widgets of UI)     │  React
├────────────────────────────────────────────────────────────┤
│ STATE       /store (Zustand slices, selectors, persist)     │  React-free logic,
├────────────────────────────────────────────────────────────┤  calls lib
│ PURE LIB    /lib  (tree, ops, parser, recurrence, dnd, …)   │  no React, no native
│ SERVICES    /services (notifications, haptics, …)           │  native side effects
├────────────────────────────────────────────────────────────┤
│ THEME       /theme (tokens, glyphs, platform constants)     │  imported by all UI
└────────────────────────────────────────────────────────────┘
```

**Allowed imports** (an arrow means "may import"):

| From ↓ / To → | `/theme` | `/lib` | `/store` | `/services` | `/components` | `/app` |
|---|---|---|---|---|---|---|
| `/app` | ✓ | ✓ (types, pure helpers) | ✓ | ✓ | ✓ | n/a |
| `/components` | ✓ | ✓ (types, pure helpers) | ✓ (selectors, actions) | ✓ (haptics only) | ✓ | ✗ |
| `/store` | ✗ | ✓ | ✓ | ✓ (side effects after state changes) | ✗ | ✗ |
| `/services` | ✗ | ✓ | ✓ (read state, enqueue ops) | ✓ | ✗ | ✗ |
| `/lib` | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/theme` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Hard rules:**
1. **`/lib` is pure.** It has no React, no React Native, no Expo, no `Date.now()` without an injectable clock, and no I/O. Everything in it is unit-tested in Node.
2. **No business logic in components.** A component renders state and calls store actions; it never decides what a "complete" or a "move" means.
3. **Every `Platform.OS` branch** lives in `/services` or `/theme/platform.ts`. The other allowed platform split is a **`.web.ts(x)` twin file**: Metro picks `x.web.ts` over `x.ts` in the web build, both export the same API, and callers never know which one they got (see §9b). Anything that will behave differently on iOS gets a line in `IOS_PORT.md` when it's written.
4. **No magic numbers in components.** Colors, sizes, spacing, durations, and glyphs come from `/theme`. *(built)*
5. **No network code**, ever (PLAN §3). The release build has no INTERNET permission. *(built: `android.blockedPermissions` in `app.config.ts`)*

---

## 2. Directory map

| Path | Purpose | Does **not** contain |
|---|---|---|
| `app/` | Expo Router screens: `_layout.tsx` (providers, store hydration), `index.tsx` (list, back-button handling), `help.tsx` (collapsible user guide; update it with every new gesture or shorthand), `whats-new.tsx` (changelog after an update), `settings.tsx` (settings, backup, import, snapshot restore), `trash.tsx`, `task/[id].tsx` (deep link), `dev.tsx` (hidden dev tools: long-press the title) *(built)* | Reusable components, logic |
| `components/list/` | `TaskList`, `TaskRow` (incl. group header), `CompletedList`, `StrikeText`, `SwipeableRow`, `NestingGuides`, `drag` (controller, row gesture, overlay), `keepInView`, `titleStyle`, `HighlightFlash`, `Caret` (rotating ▸), `FocusGlow` *(built)* | Store mutations beyond calling actions |
| `components/edit/` | `InlineEditor` (+ `useEditorFocus`), `NotesField` (editor and linkified view), `ParsedChips` (shorthand preview and clearable field chips), `QuickAddBar`, `EditToolbar` (OUT/IN/SUB/PRI/NOTE/UNDO/DONE) *(built)* | Parsing and key rules (those are `lib/`) |
| `components/overlays/` | `SheetModal` (shared bottom-sheet frame: fading backdrop, rising sheet), `ActionSheet` (scrolls when long), `ContextMenu`, `DueSheet` (single task or selection), `RepeatSheet`, `MovePicker`, `Toast` *(built)* | |
| `components/common/` | `Header`, `Tabs`, `SearchBar` (+ filter chips), `Breadcrumb`, `useMinute`, `motion` (Reduce Motion: `MotionConfig`, `useReduceMotion`), `BlockCursor` (one shared blink value), `BootSequence` (`BootGate`, `useBooting`), `useOnboarding` (tips, What's new, first-launch focus), `CrashScreen` (the root ErrorBoundary: tasks are safe, retry, copy details) *(built)* | |
| `components/dev/` | Dev-screen tools (`StorePanel`: seed and clear, with confirmation) *(built)* | User-facing features |
| `store/` | Zustand store (`createStore.ts`), history, memoized selectors, persistence (`persist.ts`, `repair.ts`), migrations, MMKV adapter (`mmkv.ts`), `onboarding` (first-run tips, last build seen), `backup` (reads backup files and snapshots: migrate → repair → validate, with plain-language errors) *(built)* | UI code. Only `mmkv.ts` touches the native storage module |
| `lib/` | Pure logic. *(built: `types`, `taskMap`, `tree`, `flatten`, `ops`, `complete` (incl. repeat advance), `copy`, `outliner`, `paste`, `parser`, `dates`, `purge`, `reminders`, `externalOps`, `recurrence`, `dnd`, `search`, `bulk` (selection, Move to…, sort, Trash; `sequence()` builds one undo step from many), `sample` (example tasks), `changelog` (CHANGELOG.md → What's new), `backup` (backup file format, counts, merge and replace ops))* | Anything impure |
| `services/` | Native side effects. *(built: `haptics`; `notifications` (setup, reconcile, permission); `externalOps` (the ops.pending queue); `notificationTask` (headless DONE/SNOOZE); `reminderLifecycle` (drain + sync at start, on foreground, after changes); `quickActions` (app icon "New task"); `appInfo` (version, build); `backup` (save to a chosen folder, share, pick a file; system pickers only, no storage permission))* | UI |
| `theme/` | Design tokens: `colors`, `typography`, `spacing`, `motion`, `glyphs`, `platform` *(built; glyphs approved on device)* | Components |
| `plugins/` | Expo config plugins: the **only** way to change native config that `app.config.ts` can't express *(built: release signing)* | |
| `scripts/` | Dev tooling: font subset, icon generation, `seed.ts` (7,500-task perf data), `gen-changelog.mjs` (CHANGELOG.md → `assets/changelog.json`; a test fails when stale), release *(built: fonts, icon, seed, changelog)* | App code |
| `assets/` | Subset fonts, placeholder icons, `changelog.json` (generated) *(built)* | |
| `__tests__/` | Jest tests, plus `fixtures/` with saved beta data for migration tests *(built: theme, config)* | |
| `e2e/android/` | Maestro flows, run by `scripts/e2e-android.sh` against the separate "quest_log E2E" test app (never the real one) *(written; not yet run, see RELEASING.md)* | |
| `android/`, `ios/` | **Generated** by `expo prebuild`. Never edited, never committed. | Anything hand-written |

---

## 3. Data model *(built: `lib/types.ts`, `lib/taskMap.ts`)*

A **normalized** store (PLAN §7.1):

```ts
buckets:  Bucket[256]               // tasks by ID, split by a hash of the ID
children: Record<ID | 'root', ID[]> // ordered child ids per parent
structureVersion: number            // bumped on every structural change
schemaVersion: number               // drives migrations
```

**Buckets** (a deviation from PLAN's flat `byId`, made in Phase 3 for the keystroke budget):
- An immutable edit copies the 256-slot outer array plus the one bucket of about 30 tasks it touches, instead of a 7,500-entry map.
- Always read and write tasks through `lib/taskMap.ts`: `findTask`, `withTasks`, `withoutTasks`, `forEachTask`. Never index buckets directly.
- `bucketOf(id)` maps a UUID's last two hex digits straight to a bucket, with no loop, because Hermes is mostly interpreted. Any other ID falls back to an FNV hash.
- **`TasksDocument`** is the same tree with a flat `byId`. It's used where readability matters more than speed: migrations, fixtures, snapshots, and backups. Convert with `toDocument` and `fromDocument` (`lib/tree.ts`).

**Rules:**
- **Text edits** (title, notes) write only to `byId[id]`. They never touch `children` and never bump `structureVersion`, so typing never re-flattens the tree.
- **Structural changes** (add, delete, move, indent, complete, collapse) bump `structureVersion`.
- **Completed top-level tasks stay in `children.root`.** The ACTIVE tab filters them out, so unchecking one restores its exact position.
- **`updatedAt` bubbles up** to every ancestor on any change. This powers the COMPLETED sort.

**Derived data is never stored** (PLAN §7.2):
- `activeRows`, `completedRows`, and `counts` are memoized selectors keyed on `structureVersion` (plus search/filter inputs).
- They're computed once per structural change, not per render.

---

## 4. Data flows

### 4.1 Keystroke *(built; verified by `__tests__/components/TaskRow.test.tsx`)*
```
TextInput → store.updateTitle(id, text) → byId[id] replaced
          → only <TaskRow id> re-renders (selector on byId[id])
          → persist marks dirty → MMKV write ≤ 1 per 300 ms
```
Budget: under 4 ms of JS per keystroke (PLAN §5).

### 4.2 Structural op *(planned, Phase 2–5)*
```
action → ops.apply(state, op) → { nextState, inverse }
       → history.push(inverse) → structureVersion++
       → selectors recompute once → FlashList diffs by key
       → side effects (async): notifications.sync
```

### 4.3 External ops queue *(built in Phase 7)*
Notification buttons (DONE, SNOOZE 15M) can fire while the app is closed. They **never** mutate state directly:
```
append { op, taskId, at } to MMKV "ops.pending"
  Android: headless JS drains immediately
  iOS:     app drains on launch and on every foreground
drain = apply each op via lib/ops.ts (idempotent: skip if already applied)
```
One code path (`lib/ops.ts`) handles every mutation, wherever it came from.

### 4.4 Startup sequence
```
1. Native splash (black, green <|->)                       (built)
2. Fonts: embedded at build time, no wait                  (built)
3. Hydrate store from MMKV, synchronously, at import       (built: store/index.ts)
4. Migrate (pre-migration snapshot first), repair, validate (built: store/persist.ts)
4b. Purge Trash older than 7 days (not undoable)            (built)
4c. Daily snapshot, deferred about 3 s after launch         (built)
5. Drain ops.pending                                       (built: services/reminderLifecycle.ts)
6. Reconcile notifications (async)                         (built; also on foreground and after changes)
7. Boot sequence overlay, in parallel with readiness       (built: BootGate; cold start only, skippable,
                                                            skipped with Reduce Motion or the setting)
8. After the boot screen: What's new (after an update) or   (built: useOnboarding)
   quick-add focus (fresh install); first-run tips
```

---

## 5. The op pattern *(built: `lib/ops.ts`)*

**Every mutation is a typed op** in `lib/ops.ts`:

```ts
type Op =
  | { type: 'insert'; parentId; index; tasks: Task[]; children }  // a whole subtree
  | { type: 'remove'; id }                                         // hard remove (subtree)
  | { type: 'move'; id; parentId; index }                          // index counted without the task
  | { type: 'update'; changes: { id; fields }[] }                  // field changes
  | { type: 'batch'; ops: Op[] };                                  // one undo step

apply(state, op) → { state: nextState, inverse: Op, structural: boolean }
```

- `apply` is **pure**: same input, same output, no clock or randomness (time and IDs are passed in). It never mutates its input, and unchanged tasks keep their object identity, so their rows don't re-render.
- Every op returns its **inverse**. Undo applies the inverse, and redo re-applies the original.
- Ops that touch several tasks (cascade complete, paste, bulk actions) are **one op**, so they're one undo step.
- **Test contract:** for every op, `apply(apply(s, op).state, inverse)` deep-equals `s`, ignoring `structureVersion`, which only ever increases. A seeded fuzz test runs 2,000 random ops and checks this plus the tree invariants after every one.
- **Primitive ops vs builders:** `apply` only understands `insert`, `remove`, `move`, `update`, and `batch`. User intents (`addTask`, `editTask`, `moveTask`, `indent`, `outdent`, `softDelete`, `restore`) are *builders* that return those primitives, and they handle `updatedAt` bubbling. New features add builders; the primitive set rarely changes.
- **Structural fields:** `done`, `deletedAt`, `collapsed`, `priority`, `dueAt`, and `repeat` bump `structureVersion`. `title`, `notes`, and `updatedAt` don't, so typing never re-flattens the tree. As a result, the COMPLETED tab re-sorts on the next structural change or tab switch, not on every keystroke.
- **Empty child lists:** a parent with no children has *no key* in `children` (except `root`). Keeping a single representation makes undo round-trips exact.

---

## 6. Persistence and migrations *(built: `store/persist.ts`, `store/repair.ts`, `store/migrations/`)*

| MMKV key | Contents |
|---|---|
| `tasks.v1.meta` | `children`, `structureVersion`, `schemaVersion`, `progress` (XP and streaks) |
| `tasks.v1.b.<n>` | One task bucket (only if non-empty) |
| `snapshot.premigration.v<N>` | Exact data before a migration ran |
| `corrupt.<time>` | Raw bytes of anything that failed to load (never overwritten) |
| `settings.v1` | User settings |
| `onboarding.v1` | First-run tips seen, last build whose What's new was shown |
| `ui.v1` | Collapsed/zoom state, last tab |
| `ops.pending` | External ops queue |
| `snapshot.YYYY-MM-DD` | Daily safety copies (keep the last 3) |

**Writes:**
- Throttled to one per 300 ms (trailing edge), plus a forced flush whenever the app leaves the foreground.
- **Incremental:** the saver remembers the last bucket objects it wrote and re-serializes only buckets whose identity changed. `meta` is written only when the structure changes.
- Buckets are written **before** `meta`.
- Measured with the seed: a keystroke plus its save takes about 0.05 ms on desktop.

**Loading** never throws:
1. Assemble meta and all buckets into a document.
2. Migrate.
3. **Repair** what an interrupted save could leave behind: orphans are re-attached, missing list entries dropped, cycles broken.
4. Validate.

Anything unreadable is kept under `corrupt.<time>`, and the app recovers from the newest daily snapshot. Data from a *newer* app version opens read-only and is never overwritten.

**Adding a migration** (required for **every** schema change once friends have data):
1. Save the current data shape as a fixture: `__tests__/fixtures/tasks-v<N>.json`, a flat `TasksDocument` taken from a real beta install (for example, the daily snapshot).
2. Add `store/migrations/<N>-to-<N+1>.ts`, a pure `(old document) => new document` function.
3. Register it in the migrations index and bump `schemaVersion`.
4. Add a test that loads the fixture, migrates it, and checks the result.
5. Startup snapshots the data **before** running any migration.

---

## 6g. Quests: order and categories *(built: `lib/quests.ts`, `lib/flatten.ts`)*

- **Order:** quests (true top level) display by **priority first** (!!! → none), then **newest-modified first** (`questOrder`). `updatedAt` bubbles up from any change inside a quest, so a new quest is at the top of its priority and active ones rise.
  - Collapsing and expanding a quest are view changes, so they don't touch `updatedAt`.
  - **Locked while editing:** `questOrderLock` is captured when editing starts and released when it ends, so structural changes made while editing (PRI, DUE, SUB, shorthand) can't move the row under the editor. When editing ends, TaskList scrolls to the edited task if the re-sort moved it.
  - **Locked while a completed quest leaves:** completing bumps `updatedAt`, which would send the quest to the top for its exit. `toggleDone` takes the lock too, and `releaseLingering` drops it once no exit is playing and nothing is being edited.
  - The stored `children` order is untouched. Below the top level, the manual order still applies, and zooming into a quest shows its objectives in manual order.
  - Like COMPLETED, the order refreshes on structural changes, never while typing.
  - Quick-add bumps `revealTop` so the list scrolls up to the new quest. FlashList otherwise holds the visible rows in place.
- **Categories:** `task.category` is `daily`, `main` or `misc`. It's optional: older quests derive theirs, with repeating daily → daily and anything else → main (`questCategory`).
  - It's a structural field.
  - A quest added on a tab takes its category (`categoryForNew`). On DAILY it also gets a daily repeat.
  - Change it from the hold menu (`setQuestCategory`, undoable).
- **Navigation rules (pass 2026-10-09):**
  - **Android back** is `store.backStep()`, one mode per press: selection → search → zoom → COMPLETED→ACTIVE → tab→ALL → leave.
  - **Switching tabs** first commits an edit in progress and ends selection (`leaveListModes`).
  - **`revealTask`** picks a tab that lists the task.
  - **Returning to the main screen** (notification tap, shortcut) uses `dismissAll`, and the task link goes back rather than stacking a second main screen.
  - **A quest is `parentId === null`**, never "depth 0 in this view", so zoomed-in objectives stay objectives.
  - `npm run web:nav` (`e2e/web/navigation.mjs`) walks every screen and exit in a local browser build.
- **Navigation rules (second pass, 2026-10-09):**
  - **Home:** tapping the title runs `goHome()`: ALL, ACTIVE, top level, search closed, scrolled up.
  - **Re-tapping the selected tab** (a quest tab or the switch) runs `toTabTop()`: out of a zoom to the tab's top level, otherwise scroll to the top. Scrolling to the top is one signal, `revealTop`, which each list honours only while it's the one on screen.
  - **Each view keeps its place.** A view is a quest tab plus a zoom level on ACTIVE, or a quest tab on COMPLETED. `useViewPlace` remembers each view's scroll offset and restores it when you return (unseen views start at the top). The new view slides in 16 pt from its side (`rank`: tabs left to right, deeper zoom to the right), and ACTIVE ↔ COMPLETED does the same (`useViewEntrance` in app/index.tsx).
  - **The zoom follows the tree:** a store subscription runs `shownZoom()` (lib/flatten.ts) on every change. Zoomed into a quest that is completed (after its exit has played), deleted, undone away or no longer on this tab, you're taken out to the nearest level still there.
  - **Lingering is timed by the store** (`toggleDone` → `releaseLingering` after `LINGER_MS`), not by the quest's row, which isn't mounted when you're zoomed into it.
  - **The breadcrumb's first part is the tab's name** (`← DAILY`), because that's where it leads.
- **View state:** `ui.category` (`all` / a category) picks the quest tab, and `ui.tab` (`active` / `completed`) is the switch under it.
  - Both lists filter by the category.
  - `tabCounts` gives the badges in one pass per structure change.

## 6f. XP, levels and streaks *(built: `lib/xp.ts`, in `lib/complete.ts`)*

- **Where it lives:**
  - `TasksState.progress` holds the total XP, the day streak, the best streak and the last active day. It's saved in `tasks.v1.meta`.
  - Each completed task records the XP it earned (`task.xp`). A repeating task keeps its on-time `streak`.
  - All of these are optional in saved data (absent = 0), so there was no migration.
- **Changed only by ops:**
  - `check()` returns the completion op plus the XP (`awardXp`): `xp` field changes and a `progress` op.
  - `uncheck()` adds `revokeXp`.
  - The `progress` op's inverse restores the previous record exactly, so UNDO takes XP back and REDO gives it again.
  - Every way of completing goes through `check()`: checkbox, swipe, multi-select, a notification's DONE.
- **Never lowered by cleanups:** clearing, deleting and purging tasks leave `progress` alone.
  - Duplicates carry no XP.
  - **Replace** from a backup takes the backup's progress only when it's higher, so moving phones brings your level, and restoring an old snapshot never lowers it.
- **Rules** (the file header of `lib/xp.ts` has the full list):
  - per task: base 10, a priority bonus, +8 per subtask for quests, +5 on time
  - multipliers: the repeat streak (×1.1 per step, up to ×2) and the day streak (+5% per day, up to +50%)
  - each level needs `50 + 25·level` XP
- **UI:**
  - the level is in the header title
  - `XpBar` sits under the tabs
  - `QuestMeter` on group rows uses the `subtaskCount` selector, cached per structureVersion
  - the toast reports XP gained and new levels

## 6a. Backup, import and restore *(built: `lib/backup.ts`, `store/backup.ts`, `services/backup.ts`)*

- **File:** `{ format: "quest_log-backup", version: 1, exportedAt, app: { version, build }, tasks: TasksDocument }`. It holds the whole tree, Trash included. Settings aren't in it.
- **Reading** a backup, or a daily snapshot, uses the startup pipeline: `migrate` → `repairDocument` → `assertValidDocument`. Every failure becomes a `BackupError` with a message for the user, and nothing in the app changes.
- **Bringing tasks back is an op**, so it's one undo step:
  - **replace** removes every top-level subtree and inserts the backup's. The `remove` inverses restore the old tree exactly.
  - **merge** inserts only the subtrees whose root the app doesn't have (matched by ID), under the original parent if it exists, else at the top level. It's idempotent.
  - Restoring a snapshot is a replace.
- **Files** go through Android's own pickers (`Directory.pickDirectoryAsync`, `File.pickFileAsync`) or the share sheet. There's no storage permission, and the app only touches what the user picks.
- **Auto-clear completed** runs at launch, next to the Trash purge. It isn't undoable, but it only moves tasks to Trash, where they stay restorable for 7 days.

## 6b. React bindings *(built: `store/react.tsx`)*

- Components get the store from **context** (`<StoreProvider>`), never by importing `store/index.ts`. That module creates the MMKV-backed singleton, and only `app/_layout.tsx` imports it, so component tests can render against an in-memory store.
- `useAppStore(selector)` subscribes narrowly. Rows select their own task (`findTask(s.tasks, id)`) and a boolean (`s.editingId === id`).
- `useActions()` is for **actions only** inside event handlers. For current values inside a handler, use `useStoreBundle().store.getState()`.
- Render functions must be pure: no `Date.now()`. Time-relative UI subscribes to `useMinute()`, a single timer aligned to each minute boundary.

## 6c. Completion flow *(built: `lib/complete.ts`, `store.toggleDone`)*

1. **Check** completes the task's live subtree. Parents whose live children are all done auto-complete, chaining upward. It's one op, so one undo step.
2. If a **top-level** task became done, its ID goes into `store.lingering` (before the op lands) and the quest order locks. `flattenActive({ keep })` keeps it on ACTIVE, in place, while the burst plays and holds (600 ms), then the quest and its subtask rows slide right and fade (200 ms). After `LINGER_MS` (800 ms) the store's timer calls `releaseLingering` and it moves to COMPLETED.
   - **The burst** (`components/list/CompleteBurst.tsx`, on every real check): the checkbox pops and flashes accent, a scan line sweeps the row behind its content, and `+N XP` rises from the right edge. The XP comes from `store.lastGain`, which only the checked row subscribes to. `useJustChecked` ignores rows that mount done or that FlashList recycles onto another task; `StrikeText` takes the task `id` for the same reason.
3. A toast `COMPLETED · UNDO` appears. UNDO undoes the most recent step, which is always the one the toast describes.
4. **Uncheck** clears the task and every done ancestor. **Restore** (COMPLETED) also clears the subtree.
5. Haptics: light for check/uncheck, success when a group or top-level task completes, medium for delete, and a tick when a swipe crosses its threshold.

## 6d. Shorthand *(built: `lib/parser.ts`)*

- **Quick-add bar:** the text is parsed on Enter, and the task is created with the parsed fields already set.
- **Editing a title:** the shorthand is applied once, when editing finishes, as its own undo step, and only if the title changed during that session. That way an escaped literal (`\@5pm`, stored as `@5pm`) isn't re-parsed every time the task is edited.
- **Live chips** show the parse result while typing. `now` comes from `useMinute()`, so renders stay pure.

## 6e. Reminders *(built: `lib/reminders.ts`, `services/notifications.ts`)*

- **Deterministic identifiers.** Every notification is `task:<id>:<dueAt>`. Reconciling means comparing "desired" (from the tree) with "scheduled" (from the OS) as sets: cancel the extras, schedule the missing. It's safe to run any time. Changing a due date changes the identifier, so the old notification is cancelled automatically. `Task.notificationIds` is left unused.
- **Permission** is requested inside a sync, the first time a reminder is actually needed.
- **DONE / SNOOZE 15M** are action buttons that don't open the app:
  - With the app closed (Android), the task in `services/notificationTask.ts` runs headless. It appends to `ops.pending`, drains, flushes persistence, dismisses the notification and re-syncs.
  - With the app open, the response listener does the same.
  - Both paths are idempotent, so if both fire it doesn't matter.
- **Tapping the notification body** calls `revealTask` (tab, expand, scroll, flash).

## 6h. Keyboard and sheets *(built: `components/common/keyboard.tsx`)*

- **Sheets open only after the keyboard has closed** (`useAfterKeyboardCloses`, used by `SheetModal` and `MovePicker`).
  - The reason: while an RN `Modal` is showing, react-native-keyboard-controller pauses its main-window tracker (`ModalAttachedWatcher`). A keyboard that closes during that time leaves the tracker believing it's still open.
  - Its focus listener isn't paused. The next time focus lands on a text field with no keyboard (the row editor closing hands focus to quick-add), it reports "keyboard open, full height" from that stale state, and the sticky `> new quest` bar floats mid-screen. This was the stuck-bar bug of 2026-10-09.
  - `KeyboardController.dismiss()` resolves once the keyboard is gone, so the tracker sees it close. There's a 450 ms fallback.
- **The sticky bars ignore a phantom keyboard:** this is the second line of defence. The `KeyboardStickyView` wrapper turns itself off when the library reports a keyboard that React Native's own events (which read the window directly) haven't confirmed 700 ms later. The next real keyboard opening or closing turns it back on.
- **Components import keyboard pieces from `components/common/keyboard`, never from the library**, so the web build can swap in its own (`keyboard.web.tsx`).
- **Objective titles** (`lib/title.ts`) start with a capital letter. They're stored that way when typed (`commitEdit`, only if the title changed), quick-added or pasted. `shownTitle()` capitalizes on display for older titles and for quests moved under another quest. Search highlights stay aligned because the capital is always the same length.

## 7. Side effects

- Side effects run **after** state changes, asynchronously, and never block the UI thread.
- Notification scheduling and haptics live in `/services`, which are the only modules that call native APIs.
- **Throttles:** persist 300 ms.
- **Retired keys:** data keys a past version wrote and nothing reads any more are listed in `RETIRED_KEYS` (store/kv.ts) and deleted at startup. Example: `widget.snapshot`, from the removed widget.
- **Idempotency:** notification reconciliation and ops-queue draining are both safe to run repeatedly.

---

## 8. Performance rules (PLAN §5)

1. **Rows subscribe to their own task only** (`useStore(s => s.byId[id])`), never to the whole list.
2. **At most one `TextInput` is mounted.** Every other row is a plain `Text`.
3. **FlashList** with `getItemType` by row kind (group header, task, completed), and stable keys (task IDs).
4. **Animations run on the UI thread** via Reanimated worklets. Never animate with `setState`. Reduce Motion is applied globally by `<MotionConfig/>` (Reanimated's `ReducedMotionConfig`), so animations need no per-call checks; only multi-step effects (boot screen, blinking cursor) read `useReduceMotion()`.
5. **Measure with the seed data** (`scripts/seed.ts`: 1,000 active plus 5,000 completed) in a **release** build. `__tests__/perf.test.ts` runs desktop smoke limits on every `npm test`.
6. If a change would break a budget, **stop and flag it**. Don't work around it silently.

---

## 9. Build and native configuration *(built)*

| | `dev` | `release` |
|---|---|---|
| Package | `com.thedungeons2077.questlog.dev` | `com.thedungeons2077.questlog` |
| Scheme | `questlog-dev://` | `questlog://` |
| JS | Metro (live reload, over USB via `adb reverse`) | Hermes bytecode in the APK |
| Permissions | Dev defaults (INTERNET for Metro) | Allow-list (`VIBRATE`); INTERNET, overlay and storage blocked (`blockedPermissions`) |
| Signing | Debug key | Release key (`plugins/withReleaseSigning.js`) |
| ABIs | arm64-v8a | arm64-v8a, plus R8, resource shrinking and compressed native libraries |

- `app.config.ts` reads `APP_VARIANT` and `version.json`, the single source of truth for `versionName` and `versionCode`.
- **Native changes go only through config plugins** in `/plugins`. A clean `expo prebuild` always reproduces the same app.
- **The signing keystore lives outside the repo** (`~/.quest_log/release.keystore`), and its passwords are in `~/.gradle/gradle.properties`. See `RELEASING.md`.
- **Fonts** are subset by `scripts/subset-fonts.sh` and embedded by the `expo-font` plugin.

---

## 9b. Web build / iPhone PWA *(built)*

The same app, exported as a static single-page site (`npm run web:export` → `web-dist/`) and installed on iPhones with **Add to Home Screen**. It's deployed to GitHub Pages by `scripts/deploy-web.sh`.

| Native module | Web twin | Why |
|---|---|---|
| `components/common/keyboard.tsx` (keyboard-controller) | `keyboard.web.tsx` | Safari covers the page with the keyboard; `visualViewport` measures it, and sticky bars lift by that much |
| `components/list/useKeyboardHeight.ts` | `.web.ts` | Same measurement, for list padding |
| `components/list/focusedInput.ts` | `.web.ts` | `document.activeElement` (keep-in-view) |
| `components/common/useAppFonts.ts` | `.web.ts` | Fonts load at runtime on the web |
| `services/datePicker.ts` (Android dialogs) | `.web.ts` | The browser's own picker, on a temporary input inside the open sheet (modals trap focus) |
| `services/notifications.ts`, `reminderLifecycle.ts`, `notificationTask.ts` | `.web.ts` | No-ops: iPhone web apps can't schedule local notifications. `services/reminderSupport.web.ts` (`remindersAvailable = false`) hides the ◔ mark, and the UI explains it |
| `services/backup.ts` (folder picker, share) | `.web.ts` | Share sheet (Save to Files), else a download; import through `<input type=file>` |
| `store/mmkv.ts` | `.web.ts` | MMKV's web version uses localStorage. Over quota, the daily snapshots are dropped before a live write fails; it asks for persistent storage |

- **Offline:** `scripts/web-export.mjs` writes `sw.js`, a service worker that stores every file of the build. Pages are network-first (so updates arrive) with the stored app as the offline fallback. Other files are cache-first (their names change each build).
- **Enter in multiline editors:** React Native Web inserts a line break instead of submitting. `isEnterInsert` (lib/paste.ts) tells that apart from a paste on every platform.
- **Page template:** `public/index.html` holds the iOS home-screen tags, app-like touch CSS (no callout or selection on long-press, no bounce) and the service-worker registration. `public/manifest.json` and `public/icons/` come from `scripts/make-web-icons.sh`.
- **Tests:** `npm run web:test` (`e2e/web/smoke.mjs`) drives the built site in headless Chromium as an iPhone 15. It checks first run, quick-add with shorthand, complete and UNDO, reload persistence, **launching with the server stopped**, the date picker and a backup round trip. Gestures were checked with Chromium's touch synthesizer.

---

## 10. Checklist for adding a feature

1. **Spec:** find the PLAN section and note any deviation in the commit message.
2. **Pure logic first:** add or extend a `/lib` module with unit tests, including op inverses.
3. **Store:** wire the op into a slice action. Bump `structureVersion` if the change is structural.
4. **Schema change?** Add a migration and a fixture test (§6).
5. **Side effects:** add or update a `/services` module. Keep it async and throttled.
6. **UI:** components use selectors, actions, and `/theme` tokens only.
7. **Accessibility:** add labels, roles, and custom actions (PLAN §13).
8. **Behaves differently on iOS?** Add a line to `IOS_PORT.md`.
9. **New dependency?** Justify it in one line in the commit message (PLAN §0).
10. **Comments:** every file gets a header comment (purpose and layer), every export gets a doc comment, and non-obvious blocks get a comment explaining *why*.
11. **Verify:** `npm run check` (typecheck, lint, tests) passes, and you've tried it on the phone.
12. **Update this file** if the change adds a module, a flow, or a rule.
