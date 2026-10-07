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
│ SERVICES    /services (notifications, widget, haptics, …)   │  native side effects
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
3. **Every `Platform.OS` branch** lives in `/services` or `/theme/platform.ts`. Anything that will behave differently on iOS gets a line in `IOS_PORT.md` when it's written.
4. **No magic numbers in components.** Colors, sizes, spacing, durations, and glyphs come from `/theme`. *(built)*
5. **No network code**, ever (PLAN §3). The release build has no INTERNET permission. *(built: `android.blockedPermissions` in `app.config.ts`)*

---

## 2. Directory map

| Path | Purpose | Does **not** contain |
|---|---|---|
| `app/` | Expo Router screens: `_layout.tsx` (providers, store hydration), `index.tsx` (list), `dev.tsx` (hidden dev tools: long-press the title) *(built)* | Reusable components, logic |
| `components/list/` | `TaskList`, `TaskRow` (incl. group header), `CompletedList`, `StrikeText`, `SwipeableRow`, `NestingGuides` *(built)*; drag layer *(planned, Phase 9)* | Store mutations beyond calling actions |
| `components/edit/` | `InlineEditor` (+ `useEditorFocus`), `NotesField` (editor and linkified view), `ParsedChips` (shorthand preview and clearable field chips), `QuickAddBar`, `EditToolbar` (OUT/IN/SUB/PRI/NOTE/UNDO/DONE) *(built)* | Parsing and key rules (those are `lib/`) |
| `components/overlays/` | `ActionSheet`, `ContextMenu` (long-press on ACTIVE rows, with a priority selector), `Toast` *(built)*; date/repeat sheets, boot sequence *(planned)* | |
| `components/common/` | `Header`, `Tabs`, `useMinute` (shared minute clock) *(built)*; filter chips, breadcrumb, block cursor *(planned)* | |
| `components/dev/` | Dev-screen tools (`StorePanel`: seed and clear, with confirmation) *(built)* | User-facing features |
| `store/` | Zustand store (`createStore.ts`), history, memoized selectors, persistence (`persist.ts`, `repair.ts`), migrations, MMKV adapter (`mmkv.ts`) *(built)* | UI code. Only `mmkv.ts` touches the native storage module |
| `lib/` | Pure logic. *(built: `types`, `taskMap`, `tree`, `flatten`, `ops`, `complete`, `copy`, `outliner`, `paste`, `parser`, `dates`, `purge`; planned: `recurrence`, `dnd`, `search`)* | Anything impure |
| `services/` | Native side effects. *(built: `haptics`, which follows the Settings toggle; planned: notifications, external ops queue, widget, backup)* | UI |
| `widgets/android/` | Home screen widget UI and headless task handler *(planned, Phase 12)* | |
| `theme/` | Design tokens: `colors`, `typography`, `spacing`, `motion`, `glyphs`, `platform` *(built; glyphs approved on device)* | Components |
| `plugins/` | Expo config plugins: the **only** way to change native config that `app.config.ts` can't express *(built: release signing)* | |
| `scripts/` | Dev tooling: font subset, icon generation, `seed.ts` (7,500-task perf data), release *(built: fonts, icon, seed)* | App code |
| `assets/` | Subset fonts, placeholder icons *(built)* | |
| `__tests__/` | Jest tests, plus `fixtures/` with saved beta data for migration tests *(built: theme, config)* | |
| `e2e/android/` | Maestro flows *(planned, Phase 14)* | |
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
       → side effects (async): notifications.sync, widget.refresh (2 s throttle)
```

### 4.3 External ops queue *(planned, Phase 7 / 12)*
Widget taps and notification buttons can fire while the app is closed. They **never** mutate state directly:
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
5. Drain ops.pending                                       (planned, Phase 7)
6. Reconcile notifications (async)                         (planned, Phase 7)
7. Boot sequence overlay, in parallel with readiness       (planned, Phase 11)
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
| `tasks.v1.meta` | `children`, `structureVersion`, `schemaVersion` |
| `tasks.v1.b.<n>` | One task bucket (only if non-empty) |
| `snapshot.premigration.v<N>` | Exact data before a migration ran |
| `corrupt.<time>` | Raw bytes of anything that failed to load (never overwritten) |
| `settings.v1` | User settings |
| `ui.v1` | Collapsed/zoom state, last tab |
| `ops.pending` | External ops queue |
| `widget.snapshot` | Compact widget data |
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

## 6b. React bindings *(built: `store/react.tsx`)*

- Components get the store from **context** (`<StoreProvider>`), never by importing `store/index.ts`. That module creates the MMKV-backed singleton, and only `app/_layout.tsx` imports it, so component tests can render against an in-memory store.
- `useAppStore(selector)` subscribes narrowly. Rows select their own task (`findTask(s.tasks, id)`) and a boolean (`s.editingId === id`).
- `useActions()` is for **actions only** inside event handlers. For current values inside a handler, use `useStoreBundle().store.getState()`.
- Render functions must be pure: no `Date.now()`. Time-relative UI subscribes to `useMinute()`, a single timer aligned to each minute boundary.

## 6c. Completion flow *(built: `lib/complete.ts`, `store.toggleDone`)*

1. **Check** completes the task's live subtree. Parents whose live children are all done auto-complete, chaining upward. It's one op, so one undo step.
2. If a **top-level** task became done, its ID goes into `store.lingering`. `flattenActive({ keep })` keeps it on ACTIVE while the strike draws (200 ms) and holds (500 ms) and the row fades. Then `releaseLingering` lets it move to COMPLETED.
3. A toast `COMPLETED · UNDO` appears. UNDO undoes the most recent step, which is always the one the toast describes.
4. **Uncheck** clears the task and every done ancestor. **Restore** (COMPLETED) also clears the subtree.
5. Haptics: light for check/uncheck, success when a group or top-level task completes, medium for delete, and a tick when a swipe crosses its threshold.

## 6d. Shorthand *(built: `lib/parser.ts`)*

- **Quick-add bar:** the text is parsed on Enter, and the task is created with the parsed fields already set.
- **Editing a title:** the shorthand is applied once, when editing finishes, as its own undo step, and only if the title changed during that session. That way an escaped literal (`\@5pm`, stored as `@5pm`) isn't re-parsed every time the task is edited.
- **Live chips** show the parse result while typing. `now` comes from `useMinute()`, so renders stay pure.

## 7. Side effects

- Side effects run **after** state changes, asynchronously, and never block the UI thread.
- Notification scheduling, widget refresh, and haptics live in `/services`, which are the only modules that call native APIs.
- **Throttles:** persist 300 ms, widget refresh 2 s.
- **Idempotency:** notification reconciliation and ops-queue draining are both safe to run repeatedly.

---

## 8. Performance rules (PLAN §5)

1. **Rows subscribe to their own task only** (`useStore(s => s.byId[id])`), never to the whole list.
2. **At most one `TextInput` is mounted.** Every other row is a plain `Text`.
3. **FlashList** with `getItemType` by row kind (group header, task, completed), and stable keys (task IDs).
4. **Animations run on the UI thread** via Reanimated worklets. Never animate with `setState`.
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
