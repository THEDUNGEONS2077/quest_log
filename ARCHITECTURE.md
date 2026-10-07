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
5. **No network code**, ever (PLAN §3). The release build has no INTERNET permission. *(built: `plugins/withRemoveInternet.js`)*

---

## 2. Directory map

| Path | Purpose | Does **not** contain |
|---|---|---|
| `app/` | Expo Router screens. `_layout.tsx` is the root shell. *(built: shell + theme check screen)* | Reusable components, logic |
| `components/list/` | Task list, rows, group headers, nesting guides, strikethrough, drag layer *(planned, Phase 4–9)* | Store mutations beyond calling actions |
| `components/edit/` | Inline editor, notes field, chips, accessory bar, quick-add *(planned, Phase 4–6)* | Parsing (that's `lib/parser.ts`) |
| `components/overlays/` | Context menu, sheets, toast, boot sequence *(planned)* | |
| `components/common/` | Header, tabs, filter chips, breadcrumb, block cursor *(planned)* | |
| `store/` | Zustand slices, memoized selectors, MMKV persistence, migrations *(planned, Phase 3)* | UI code, native calls outside persist.ts |
| `lib/` | Pure logic: `tree`, `flatten`, `ops`, `parser`, `recurrence`, `dnd`, `paste`, `search`, `dates` *(planned, Phase 2+)* | Anything impure |
| `services/` | Native side effects: notifications, external ops queue, widget, haptics, backup *(planned)* | UI |
| `widgets/android/` | Home screen widget UI and headless task handler *(planned, Phase 12)* | |
| `theme/` | Design tokens: `colors`, `typography`, `spacing`, `motion`, `glyphs`, `platform` *(built; glyphs approved on device)* | Components |
| `plugins/` | Expo config plugins, the **only** way to change native config *(built: signing, INTERNET removal)* | |
| `scripts/` | Dev tooling: font subset, icon generation, seed, release *(built: fonts, icon)* | App code |
| `assets/` | Subset fonts, placeholder icons *(built)* | |
| `__tests__/` | Jest tests, plus `fixtures/` with saved beta data for migration tests *(built: theme, config)* | |
| `e2e/android/` | Maestro flows *(planned, Phase 14)* | |
| `android/`, `ios/` | **Generated** by `expo prebuild`. Never edited, never committed. | Anything hand-written |

---

## 3. Data model *(planned, Phase 2–3)*

A **normalized** store (PLAN §7.1):

```ts
byId:     Record<ID, Task>          // O(1) lookup and update
children: Record<ID | 'root', ID[]> // ordered child ids per parent
structureVersion: number            // bumped on every structural change
schemaVersion: number               // drives migrations
```

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

### 4.1 Keystroke *(planned, Phase 4)*
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
3. Hydrate store from MMKV, synchronously, before render  (planned, Phase 3)
4. Run migrations (snapshot first)                         (planned, Phase 3)
5. Drain ops.pending                                       (planned, Phase 7)
6. Reconcile notifications (async)                         (planned, Phase 7)
7. Boot sequence overlay, in parallel with readiness       (planned, Phase 11)
```

---

## 5. The op pattern *(planned, Phase 2)*

**Every mutation is a typed op** in `lib/ops.ts`:

```ts
type Op =
  | { type: 'add'; task: Task; parentId: ID | null; index: number }
  | { type: 'move'; id: ID; toParent: ID | null; toIndex: number }
  | { type: 'setDone'; ids: ID[]; done: boolean; at: number }
  | …;

apply(state, op) → { state: nextState, inverse: Op }
```

- `apply` is **pure**: same input, same output, no clock or randomness (time and IDs are passed in).
- Every op returns its **inverse**. Undo applies the inverse, and redo re-applies the original.
- Ops that touch several tasks (cascade complete, paste, bulk actions) are **one op**, so they're one undo step.
- **Test contract:** for every op, `apply(apply(s, op).state, inverse)` deep-equals `s`.

---

## 6. Persistence and migrations *(planned, Phase 3)*

| MMKV key | Contents |
|---|---|
| `tasks.v1` | The normalized task state |
| `settings.v1` | User settings |
| `ui.v1` | Collapsed/zoom state, last tab |
| `ops.pending` | External ops queue |
| `widget.snapshot` | Compact widget data |
| `snapshot.YYYY-MM-DD` | Daily safety copies (keep the last 3) |

**Writes:** throttled to one per 300 ms (trailing edge), plus a forced flush on `AppState` → `background`. Budget: under 8 ms for 1,000 tasks.

**Adding a migration** (required for **every** schema change once friends have data):
1. Save the current data shape as a fixture: `__tests__/fixtures/tasks-v<N>.json`, taken from a real beta install.
2. Add `store/migrations/<N>-to-<N+1>.ts`, a pure `(old) => new` function.
3. Register it in the migrations index and bump `schemaVersion`.
4. Add a test that loads the fixture, migrates it, and checks the result.
5. Startup snapshots the data **before** running any migration.

---

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
5. **Measure with the seed data** (`scripts/seed.ts`: 1,000 active plus 5,000 completed) in a **release** build.
6. If a change would break a budget, **stop and flag it**. Don't work around it silently.

---

## 9. Build and native configuration *(built)*

| | `dev` | `release` |
|---|---|---|
| Package | `com.thedungeons2077.questlog.dev` | `com.thedungeons2077.questlog` |
| Scheme | `questlog-dev://` | `questlog://` |
| JS | Metro (live reload, over USB via `adb reverse`) | Hermes bytecode in the APK |
| INTERNET | Kept | Removed (`plugins/withRemoveInternet.js`) |
| Signing | Debug key | Release key (`plugins/withReleaseSigning.js`) |
| ABIs | arm64-v8a | arm64-v8a, plus R8 and resource shrinking |

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
