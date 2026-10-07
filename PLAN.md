# quest_log: Build Plan v4 (for Claude Code)

> A sleek cyberdeck-style to-do app for Android and iOS. It is fully offline, built **Android-first** on your own machine, and shared with friends as an APK from GitHub. The iOS port comes after, with the distribution method still to be decided.

---

## 0. Instructions for Claude Code

Read this whole file before writing code. Then work phase by phase (§16).

- **Phases:** finish each phase with passing tests and a commit before starting the next one.
- **TypeScript:** use `strict` mode. Avoid `any` except at library boundaries, and comment it there.
- **Dependencies:** add none beyond §4 without a one-line justification in the commit message. Bundle size is a feature.
- **Design system:** every color, spacing, font size, and duration comes from `/theme`. No magic numbers in components.
- **Render path:** never put business logic in components. Keep store actions pure and testable.
- **Performance:** if something would break a performance budget in §5, stop and flag it rather than work around it silently.
- **Android-first, iOS-ready:**
  - Development and testing target Android until Phase 15.
  - Use only libraries that support both platforms.
  - Keep every `Platform.OS` branch inside `/services` or `/theme/platform.ts`.
  - Whenever you build something that will behave differently on iOS, add a line to `IOS_PORT.md` at that moment (§15.7).
- **Beta data is real data:** friends will keep their tasks across updates. Every schema change ships with a migration and a migration test (§7.3).
- **No network:** the app makes no network calls, has no analytics, and has no crash reporting (§3).
- **No cloud services:** no Expo account, EAS Build, or EAS Update. Everything builds locally in WSL Ubuntu on Windows 11 (§15).

---

## 1. Product Summary

**quest_log** is a mobile to-do app with a **sleek, clean cyberdeck aesthetic**: pure black, shades of green, and monospace type, with restrained motion and no visual noise. The name is the only RPG nod; the UI stays a calm hacker terminal.

The core is a **nested task tree** that behaves like a fast outliner:
- Tap any task to edit it in place, and Enter creates the next task.
- Indent, outdent, and drag-and-drop build groups.

Tasks live in **two tabs**:
- **ACTIVE QUESTS:** everything still open.
- **COMPLETED QUESTS:** finished top-level tasks, sorted by date modified, newest first.

All data lives **on the device**. There are no accounts.

### Design principles

1. **Zero friction capture.** You can go from opening the app to typing a task in one tap, and add more tasks without leaving the keyboard.
2. **Optional depth.** Notes, priority, reminders, and repeats are always one tap away and never in the way.
3. **Calm terminal.** The hacker feel comes from type, color, and a few precise animations. Scanlines and glitch effects are out.
4. **Instant everything.** Every interaction responds within one frame. Nothing waits on storage.
5. **Forgiving.** Every destructive action can be undone.

---

## 2. Decisions Log

| Topic | Decision |
|---|---|
| Name | **quest_log**, lowercase with the underscore, everywhere in the UI. App ID `com.<you>.questlog`, deep-link scheme `questlog://`. |
| RPG theme | **Name only.** No XP, levels, or quest terminology in the UI, apart from the two tab labels. |
| Audience | **Me + friends beta.** You test each build yourself first, then send friends the link to that version. |
| Platforms | **Android first**, then an iOS port after Android development is complete. The codebase is shared from day one. |
| Build machine | **Windows 11 + WSL Ubuntu**, in VS Code. Android release APKs are built locally with Gradle (§15). |
| Distribution | **Android:** a signed APK published as a **GitHub Release**, with the link sent to friends directly. **iOS:** method decided before Phase 15 (§15.8). |
| Updates | **No over-the-air updates.** Every update is a new APK that installs over the old one and keeps the user's data. |
| App icon | **Placeholder `<|->`** in green on black. It will be replaced later with your own design (§9.20). |
| Completed subtasks | **Always visible**, struck through in place. There is no option to hide them. |
| Screens | **Phone, portrait only.** |
| Structure | **One tree.** Top-level tasks with children render as **group headers**. |
| Active vs completed | **Two tabs.** A top-level task moves to COMPLETED when it is checked (§9.5). Checked subtasks inside an active task stay in place, struck through. |
| Completed sort | **Date modified, newest first.** Changing anything inside a task updates its top-level task's modified time. |
| Checking a parent | **Completes all subtasks**, as one undoable action. |
| Last subtask checked | **Parent auto-completes**, chaining upward. |
| Gestures | Swipe right to complete, swipe left to delete. Long-press then drag reorders and re-nests; long-press without moving opens the context menu. |
| Drag-and-drop | **In v1** (§9.10). |
| Recurring tasks | **In v1** (§9.9). |
| Home screen widget | **In v1.** Android in Phase 12, iOS in Phase 15 (§11). |
| Feedback and crashes | **Neither.** Fully offline. Testers report by talking to you. The Help screen shows the version and build so reports are precise. |
| Blinking cursor | **Native caret themed green** in text fields (reliable with selection, autocorrect, and IME). A **blinking block `█`** appears in the boot sequence, the empty state, and the idle quick-add bar. |

---

## 3. Privacy and Offline Model

- **No network code:** the app has no backend, analytics, crash reporting, ad SDKs, or remote config.
- **Permissions:**
  - Notifications are requested only when the first reminder is set.
  - Android also needs exact alarms (optional) and boot-completed (to restore reminders).
  - Release builds **remove the `INTERNET` permission entirely**, so the app is physically unable to go online. Only the dev variant keeps it, to talk to the Metro dev server on your machine (§15.2).
- **No update checks:** the app never checks for new versions. The version and build number are shown in Help.
- **Links:** links in notes open in the system browser, which needs no app permission.
- **Backups:** these are user-initiated JSON files only (§9.17).

---

## 4. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Expo SDK (latest) + React Native New Architecture + Hermes** | One codebase, fast startup |
| Build | **Expo development build** (`expo-dev-client`), built **locally** with `npx expo run:android` and Gradle | Needed for MMKV, the keyboard controller, and widgets. Expo Go will not work. No Expo account or cloud build service. |
| Build config | **expo-build-properties** | Turns on R8 minification and resource shrinking, and limits the release APK to arm64 for a small download |
| Language | TypeScript (strict) | |
| Navigation | **Expo Router** | File-based and small |
| State | **Zustand** with selectors and `subscribeWithSelector` | About 1 KB. Rows subscribe to their own task only. |
| Persistence | **react-native-mmkv** | Synchronous and fast, with no hydration flash. Supports an iOS App Group path for the widget. |
| List rendering | **@shopify/flash-list** | Recycling list that stays smooth with thousands of rows |
| Animation | **react-native-reanimated** | UI-thread animations (strikethrough, drag, toast, boot) |
| Gestures | **react-native-gesture-handler** | Swipes and drag-and-drop |
| Keyboard | **react-native-keyboard-controller** | Accessory bar pinned exactly above the keyboard |
| Notifications | **expo-notifications** | Local scheduled reminders with action buttons |
| Android widget | **react-native-android-widget** | Widget UI written in JS, with an Expo config plugin |
| iOS widget (Phase 15) | **@bacons/apple-targets** with SwiftUI and WidgetKit | Expo-friendly way to add the widget extension |
| Haptics | **expo-haptics** | |
| IDs | `expo-crypto` `randomUUID()` | No uuid package needed |
| Fonts | `expo-font` with **JetBrains Mono** (Regular, Medium, Bold), subset to Latin plus box-drawing glyphs | |
| Date picker | `@react-native-community/datetimepicker` | Native pickers |
| Backup | `expo-file-system`, `expo-sharing`, `expo-document-picker` | |
| App icon shortcut | `expo-quick-actions` | Long-press icon → New task |
| Testing | Jest, React Native Testing Library, **Maestro** (E2E) | |

**Explicitly avoided:**
- **Redux/RTK:** too heavy for this scope.
- **Moment, date-fns, rrule, and chrono-node:** dates, recurrence, and parsing are small custom modules built on `Intl`.
- **UI kits:** the visual language is custom and minimal.
- **AsyncStorage:** it is asynchronous and causes a hydration flash.
- **Draggable list libraries:** they don't support FlashList or tree depth. Drag-and-drop is custom (§9.10).
- **Sentry and any analytics:** no network by design.
- **EAS Build, EAS Update, and other Expo cloud services:** builds are local and updates are manual APKs.

---

## 5. Performance Budgets

These are measured on a mid-range Android device (for example a Pixel 6a) in a release build.

| Metric | Target |
|---|---|
| Cold start to interactive list | **< 1.2 s** (the boot sequence overlaps this) |
| Tap on task to keyboard open with cursor | **< 100 ms** |
| Checkbox tap to visual response | **Same frame (≤ 16 ms)** |
| Scroll with 1,000 active tasks, 300 expanded | **60 fps**, no blank cells |
| Scroll COMPLETED tab with 5,000 completed tasks | **60 fps** |
| Drag a row with 1,000 tasks loaded | **60 fps**, target updates within one frame |
| Keystroke to state update | **< 4 ms of JS work** |
| Persist write (throttled) | **< 8 ms** for 1,000 tasks |
| Tab switch | **< 50 ms** |
| Widget refresh after a change | **< 2 s** |
| JS bundle (release, Hermes bytecode) | **< 3.5 MB** (raised from 2.5 MB on 2026-10-07: Expo Router alone is about 25% of the bundle. Hermes loads bytecode lazily, so the cold-start budget is the real constraint.) |
| Release APK download (arm64) | **< 25 MB** |
| Installed app size | **< 40 MB** Android, **< 40 MB** iOS |
| Memory with 1,000 tasks | **< 150 MB** |

Add `scripts/seed.ts`, which generates 1,000 active tasks nested up to 4 deep plus 5,000 completed tasks, with random notes, priorities, due dates, and repeats. Use it for every performance check.

---

## 6. Architecture Schematics

### 6.1 Layer diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ UI LAYER (Expo Router screens + components)                      │
│ Boot · List (ACTIVE / COMPLETED tabs) · Settings · Trash · Help  │
│ TaskRow · InlineEditor · AccessoryBar · DragLayer · Toast · Menu │
└───────────────▲──────────────────────────────────┬───────────────┘
                │ selectors (by id / derived)      │ actions
┌───────────────┴──────────────────────────────────▼───────────────┐
│ STATE LAYER (Zustand)                                            │
│ tasksSlice  uiSlice (tab, editingId, zoomRootId, filter, drag)   │
│ historySlice (undo/redo)  settingsSlice                          │
│ derived: activeRows · completedRows · counts (memoized)          │
└──────▲──────────────────┬────────────────────┬───────────────────┘
       │ hydrate (sync)   │ throttled persist   │ side effects
┌──────┴────────┐ ┌───────▼─────────┐ ┌─────────▼───────────────────┐
│ MMKV read     │ │ MMKV write      │ │ SERVICES                    │
│ + migrations  │ │ 300 ms throttle │ │ notifications · recurrence  │
│ + drain       │ │ + daily snapshot│ │ widget (snapshot + refresh) │
│ external ops  │ │ + widget snap   │ │ haptics · backup            │
└───────────────┘ └─────────────────┘ └─────────────────────────────┘
       ▲
       │ external ops queue (widget taps, notification actions)
┌──────┴───────────────────────────────────────────────────────────┐
│ OUTSIDE THE APP UI: home screen widget · notification actions    │
└──────────────────────────────────────────────────────────────────┘
   PURE LIB (no React, fully unit-tested)
   tree · flatten · ops (+ inverses) · parser · recurrence · dnd ·
   paste · search · dates
```

### 6.2 Data flow for one keystroke

```
TextInput onChangeText
   └─► store.updateTitle(id, text)          (O(1) map write)
         ├─► only <TaskRow id> re-renders    (selector: byId[id])
         ├─► activeRows NOT recomputed       (structure unchanged)
         └─► persist scheduler marks dirty ─► MMKV write ≤ 1 per 300 ms
```

### 6.3 Data flow for structural changes (add, indent, drag, delete, complete)

```
action ─► ops.apply(state, op) ─► push inverse op to history
       ─► structureVersion++    ─► activeRows / completedRows recomputed once
       ─► FlashList diffs by key ─► only changed cells update
       ─► side effects (async, never block UI):
            notifications.sync(affected ids)   if due/notify/repeat changed
            widget.refresh()                   throttled 2 s
```

### 6.4 External ops queue (widget and notification actions)

Widget taps and notification buttons can happen while the app is closed. They all go through one queue, so the same `ops.ts` logic always applies.

```
widget tap [x] / notification "DONE" / "SNOOZE 15M"
   └─► append { op, taskId, at } to MMKV key "ops.pending"
         ├─ Android: headless JS task drains the queue immediately
         │          (full logic: cascade, recurrence, reschedule, widget refresh)
         └─ iOS:    widget App Intent / notification response writes to the queue;
                    the app drains it on launch and on every foreground
   Drain = apply each op via ops.ts (idempotent: skipped if already applied)
```

### 6.5 Row edit state machine

```
            tap title
  ┌──────┐ ─────────────► ┌──────────┐   tap "+ NOTE"   ┌──────────────┐
  │ VIEW │                │ EDITING  │ ───────────────► │ EDITING +    │
  └──────┘ ◄───────────── │ (title)  │ ◄─────────────── │ NOTES        │
   ▲    ▲  blur / done    └────┬─────┘  tap title/back  └──────┬───────┘
   │    │                      │ Enter                          │ blur
   │    │                      ▼                                │
   │    │               new sibling created,                    │
   │    │               focus moves (stays EDITING)             │
   │    └───────────────────────────────────────────────────────┘
   │  long-press          move > 8 pt            release
   └──────────── PRESSED ───────────► DRAGGING ───────────► VIEW (drop op)
                    │ release without moving
                    └────────────────► context menu
  Rule: at most ONE row is EDITING, and nothing is EDITING while DRAGGING.
```

### 6.6 Completion flow

```
check task T
 ├─ T has children ─► mark whole subtree done (one op)
 ├─ T has repeat rule ─► recurrence.advance (§9.9) instead of staying done
 ├─ walk up ancestors: if all siblings now done ─► auto-complete parent (repeat)
 └─ if the top-level task is now done:
        strikethrough plays (200 ms) ─► hold 500 ms ─► row collapses out
        ─► COMPLETED tab counter ticks +1 with a glow pulse
        ─► toast "COMPLETED · UNDO" (5 s)
```

---

## 7. Data Model

### 7.1 Normalized store shape

```ts
type ID = string;
type Priority = 0 | 1 | 2 | 3;            // 0 none, 1 low, 2 med, 3 high

interface RepeatRule {
  freq: 'day' | 'week' | 'month' | 'year';
  interval: number;                      // every N units, ≥ 1
  weekdays?: number[];                   // 0–6, only for freq 'week'
  from: 'schedule' | 'completion';       // next date from due date or from done time
}

interface Task {
  id: ID;
  parentId: ID | null;                   // null = top level
  title: string;
  notes: string;                         // '' = no notes (no UI shown)
  done: boolean;
  doneAt: number | null;
  priority: Priority;
  dueAt: number | null;                  // scheduled date/time (epoch ms)
  notify: boolean;                       // push notification at dueAt
  notificationIds: string[];             // OS handles (several for repeats on iOS)
  repeat: RepeatRule | null;             // requires dueAt
  repeatSourceId: ID | null;             // on archived copies: the live repeating task
  collapsed: boolean;
  deletedAt: number | null;              // soft delete → Trash
  createdAt: number;
  updatedAt: number;                     // bubbles up to ancestors on any change
}

interface TasksState {
  byId: Record<ID, Task>;
  children: Record<ID | 'root', ID[]>;   // ordered child ids per parent
  structureVersion: number;              // bump on any structural change
  schemaVersion: number;
}
```

> **Change (2026-10-07, Phase 3):** `byId` is split into 256 hash buckets in memory (`TasksState.buckets`, accessed only through `lib/taskMap.ts`). At 7,500 tasks, copying one flat map per edit cost about 2 ms on desktop (6–10 ms on a phone), over the 4 ms keystroke budget. With buckets, an edit copies about 30 tasks. The flat shape above survives as `TasksDocument`, which migrations, snapshots and backups use.

**Why this shape:**
- O(1) lookup and update per task.
- Child order lives in one array per parent, so reordering and dragging are array splices.
- **Completed top-level tasks stay in `children.root`.** The ACTIVE tab simply filters them out. Unchecking one returns it to its exact original position without extra bookkeeping.
- Title and notes edits never touch `children`, so the flatten never runs while typing.
- `dueAt` and `notify` are separate, so a task can have a date (and show OVERDUE) without a notification.

### 7.2 Derived data (memoized, never stored)

- **`activeRows: { id, depth, hasChildren, progress }[]`**
  - Built by a depth-first walk from `zoomRootId ?? 'root'`.
  - Skips done top-level tasks (they live in COMPLETED), soft-deleted tasks, and collapsed subtrees. Done subtasks are always included.
  - Applies search and filter.
- **`completedRows`**
  - Top-level tasks with `done`, sorted by `updatedAt` descending, with their subtrees (collapsed by default).
  - Memoized on `[structureVersion, completedSearch]`.
- **`progress`** per parent is `{ done, total }` over direct children, computed in the same walk.
- **`counts`** covers active, done today, and overdue.

### 7.3 Persistence and migrations

- **Change (2026-10-07, Phase 3):** tasks are stored as `tasks.v1.meta` (child lists and versions) plus one `tasks.v1.b.<n>` key per non-empty bucket, and a save rewrites only the buckets that changed. A single key meant re-serializing 2.3 MB (about 150 ms on a phone) every 300 ms while typing. Load runs a repair pass, so a save interrupted between keys can't lose tasks.
- **One MMKV key per slice:**
  - `tasks.v1`
  - `settings.v1`
  - `ui.v1` (collapsed and zoom state, last tab)
  - `ops.pending`
  - `widget.snapshot`
- **Startup:**
  1. Hydrate synchronously before first render.
  2. Run migrations.
  3. Drain `ops.pending`.
  4. Reconcile notifications.
- **Writes:** use a throttled persist with a 300 ms trailing edge, plus a forced flush on `AppState` `background`.
- **Migrations:**
  - Each migration is a pure `(old) => new` function in `store/migrations/`.
  - **Before** running any migration, save a snapshot.
  - Each migration ships with a test that loads a fixture JSON saved from the previous beta version. Fixtures are committed in `__tests__/fixtures/`.
- **Safety snapshots:** once per day on first launch, copy `tasks` to `snapshot.YYYY-MM-DD` and keep the last 3.
- **Purges on launch:**
  - Hard-delete tasks in Trash older than 7 days.
  - Apply the "auto-clear completed" setting, if on (§9.17).

---

## 8. Design System

### 8.1 Color tokens (all text tokens meet WCAG AA, ≥ 4.5:1 on black)

| Token | Hex | Contrast on #000 | Use |
|---|---|---|---|
| `bg` | `#000000` | — | App background |
| `surface` | `#060D08` | — | Editing row, sheets, toast |
| `surfaceRaised` | `#0B160D` | — | Context menu, accessory bar, lifted drag row |
| `line` | `#12301A` | — | Dividers, nesting guides, idle borders (non-text) |
| `textDim` | `#2B903F` | ~5.2:1 (≥ 4.5:1 on `surfaceRaised` too; was `#2A8A3E`, which fails AA there) | Completed tasks, metadata, placeholders |
| `text` | `#2FB344` | ~7.6:1 | Body text, icons |
| `accent` | `#39FF14` | ~15:1 | Focus, caret, active controls, HIGH priority, drop indicator |
| `textBright` | `#B6FFB0` | ~18:1 | Headings, group headers, active tab |

The palette stays green-only. Destructive actions are communicated by label and icon (`✕ DEL`), not by a red color.

Only one effect is allowed: a **soft focus glow**. This is a 0–6 px green-bright shadow at 35% opacity on the editing row, the focused accessory button, and the lifted drag row.

### 8.2 Typography (JetBrains Mono)

> **Change (2026-10-07):** one size step larger for readability, after the device test: display 22/30, tab 14/20, group 17/24, body 17/24, meta 13/18, notes 15/22. Indent goes from 20 to 24 pt, and the minimum row height from 48 to 52 pt.

| Role | Size / Line height | Weight | Notes |
|---|---|---|---|
| `display` | 20 / 28 | Bold | `> quest_log_` header, lowercase as styled |
| `tab` | 13 / 18 | Bold | Tab labels, uppercase, +1 letter spacing |
| `group` | 15 / 22 | Bold | Top-level groups, uppercase, `textBright` |
| `body` | 15 / 22 | Regular | Task titles |
| `meta` | 12 / 16 | Medium | Tags, counts, due times |
| `notes` | 13 / 20 | Regular | Notes text, `textDim` |

Font sizes respect the OS text-size setting via `allowFontScaling`, clamped with `maxFontSizeMultiplier = 1.6`.

### 8.3 Spacing, shape, and motion

- **Spacing:** 4 pt grid with tokens `xs 4 · sm 8 · md 12 · lg 16 · xl 24`.
- **Indentation:**
  - 20 pt per depth level.
  - Visual indentation is capped at 4 levels; deeper tasks get a `↳N` depth badge.
- **Rows:** minimum height 48 pt, and every tap target is at least 44 × 44 pt.
- **Shape:** corner radius 2 pt and 1 pt hairline borders.
- **Motion tokens:**
  - `fast 120 ms`, `base 200 ms`, `slow 320 ms`.
  - Easing is `Easing.out(Easing.cubic)`.
  - The cursor blinks at 530 ms on and 530 ms off.
- **Reduce Motion:** when this OS setting is on, all animations become instant and the boot sequence is skipped.

### 8.4 Glyphs (typographic, no icon font)

| Glyph | Meaning |
|---|---|
| `[ ]` `[x]` | Checkbox |
| `▸` `▾` | Collapsed / expanded |
| `≡` | Has notes |
| `⏰` (or the text `RMD`, if it renders inconsistently) | Notification on |
| `↻` | Repeats |
| `!` `!!` `!!!` | Priority |
| `+` `⌕` `⚙` | Add, search, settings |

All glyphs are verified in JetBrains Mono on Android in Phase 1 and on iOS in Phase 15.

> **Phase 1 finding:** JetBrains Mono v2.304 lacks ⏰ ↻ ⌕ ⚙ ↶ ⇤ ⤢ ☐ ⧉ ⎘ ↳. In-font substitutes are used where a close match exists (for example ⏰ → ◔, ↶ → ↩, ☐ → □). `theme/glyphs.ts` is the source of truth, and the Phase 1 theme check screen shows each substitute beside the planned glyph. **Confirmed on device (Galaxy S25 Ultra, Android 16, 2026-10-07):** all substitutes are approved, and ↻ through the system fallback font looks fine.

---

## 9. Features

### 9.1 Screen layout and tabs

- **Header:** `> quest_log_` with search and settings, plus a meta line: `12 ACTIVE · 4 DONE TODAY · 1 OVERDUE`.
- **Tabs:** a segmented control under the header, `[ ACTIVE QUESTS · 12 ]  [ COMPLETED QUESTS · 34 ]`.
  - Switching is by tap only. There is no horizontal pager swipe, because it would conflict with row swipes.
  - Each tab keeps its own scroll position, search, and filter.
  - The last-open tab is restored on launch.
- **Quick-add bar:** visible on the ACTIVE tab only.

### 9.2 Task tree (ACTIVE tab)

- **Rows:**
  - Every row has a checkbox and title, plus optional priority, a due chip, and `≡`, `⏰`, and `↻` indicators.
  - Parents also show a caret and a `[done/total]` progress count.
- **Group headers:** a top-level task with children renders in the `group` style, with a thin `line` divider above it.
- **Nesting guides:** 1 pt vertical lines in `line` color, one per depth level.
- **Collapse/expand:**
  - Tap the caret to collapse or expand.
  - Long-press the caret to collapse or expand all siblings.
  - Collapsed state is persisted.
- **Zoom (focus mode):**
  - Open it from the context menu or by double-tapping a parent's caret.
  - A breadcrumb navigates back, and Android back zooms out one level.

### 9.3 Inline editing (outliner behavior)

**Editing a task:**
- Tap a title to edit it. Only that row mounts a `TextInput`; every other row is a cheap `Text`.
- The caret uses `selectionColor` and `cursorColor` set to `accent`.
- **No save buttons.** Every change is in the store immediately and persisted within 300 ms.
- Tap outside or scroll a meaningful distance to exit editing.

**Keyboard behavior** (revised 2026-10-07 after the v0.3.0 device test: editing and creating are kept separate):

| Key | Behavior |
|---|---|
| Enter / Done | **Save and stop editing** (keyboard closes). It never creates a task. |
| Backspace on an empty task | Delete it and stop editing (never deletes a task that has children) |
| Back gesture / keyboard hide | Stop editing |

**Editing toolbar** (pinned above the keyboard while editing, in place of the quick-add bar): `← OUT` · `→ IN` · `+ SUB` (new empty subtask, edited next) · `↩ UNDO` · `✓ DONE`. Phase 6 adds priority, notes and due date to it.

New tasks come from the quick-add bar (Enter there keeps the keyboard open for rapid entry), from `+ SUB`, or from paste.

**Pasting and limits:**
- **Paste multiline text** to create one task per line. Leading spaces, tabs, `-`, `*`, or `[ ]` set nesting and done state. A toast reads `PASTED 7 TASKS · UNDO`.
- Titles are limited to 500 characters and notes to 10,000, with a counter near the end.

### 9.4 Quick add and inline shorthand

- **Quick-add bar:** a persistent bar at the bottom of the ACTIVE tab shows `> new task█` when idle.
  - Enter adds the task at the end of the current view and keeps focus for rapid entry.
- **Inline shorthand**, parsed live in the quick-add bar and in any edited title:

| Typing | Result |
|---|---|
| `!` `!!` `!!!` (as a separate token) | Priority low, med, or high |
| `@today` `@tomorrow` `@fri` `@5pm` `@17:30` `@in 2h` `@mon 9am` | Due date and time, with notification on (setting) |
| `*daily` `*weekdays` `*weekly` `*mon,thu` `*every 2w` `*monthly` `*yearly` | Repeat rule (§9.9) |
| `//` | Everything after it becomes **notes**, and the notes field expands |
| `#` at the start | Create as a group, ready for children |

- **Parsed chips preview:** parsed tokens show as chips under the input, for example `!!! HIGH · ⏰ FRI 09:00 · ↻ WEEKLY`. Tokens are stripped from the title on commit.
- **Escape hatch:** prefix a word with `\` to keep it literal.
- **Parser:** `lib/parser.ts` is pure and fully unit-tested.
  - Ambiguous times resolve to the next future occurrence.
  - Day-only input uses the "default time" setting (09:00).
  - A repeat without `@` starts at the next occurrence at the default time.

### 9.5 Completion, and moving between tabs

**Checking a task:**
- Tapping `[ ]` changes it to `[x]`. A **strikethrough line** draws left to right over the title (200 ms), the text fades to `textDim`, and a light haptic fires.
  - The line is a 1.5 pt `accent` View measured with `onTextLayout`, with one segment per text line.
  - Unchecking reverses the animation.

**Parent and child rules:**
- **Checking a parent** completes its entire subtree in one undoable op.
- **Checking the last open child** auto-completes its parent. This chains upward and plays a glow pulse on each parent's progress count and the success haptic.
- **Unchecking a child of a done parent** unchecks that parent and every done ancestor.

**Moving to COMPLETED:**
- When a **top-level** task becomes done (directly or by auto-complete):
  1. The strikethrough plays and holds for 500 ms.
  2. The row collapses out of ACTIVE.
  3. The COMPLETED tab counter ticks +1 with a glow pulse.
  4. A `COMPLETED · UNDO` toast appears.
- **Done subtasks** of an active top-level task stay in place, struck through, so progress is visible.

**Swipes:**
- **Swipe right** to complete: a green track reveals `[x] DONE` and commits past a 40% threshold.
- **Swipe left** to delete: the track reveals `✕ DEL`. The task goes to Trash with a `DELETED · UNDO` toast.

**Timestamps:** `doneAt` powers "done today", and `updatedAt` powers the COMPLETED sort.

### 9.6 COMPLETED tab

- **Contents and sort:**
  - The list shows completed top-level tasks, sorted by **date modified, newest first**.
  - Changing anything in a completed task (including its subtasks) moves it to the top.
- **Rows:**
  - Text is `textDim` without a strikethrough (a full screen of strikethroughs is noisy).
  - A right-aligned relative time shows when it was last modified (`2h`, `YESTERDAY`, `MAR 14`).
- **Subtrees** are collapsed by default and expandable. Completed tasks are still editable, so you can fix a typo or add notes after the fact.
- **Swipes:**
  - **Swipe right** to **RESTORE**. This unchecks the task and its subtree, and it returns to its original position in ACTIVE.
  - **Swipe left** to delete.
- **Long-press menu:**
  - Restore
  - **Run again** (duplicate as a fresh active task with every subtask unchecked, which is great for reusable checklists)
  - Copy as text
  - Delete
- **Header actions:**
  - Search
  - **Clear…** with options for older than 7 days, older than 30 days, or all. Cleared tasks go to Trash, with undo.
- **No reordering:** drag-and-drop is disabled on this tab, since order is by date.
- **Recurring archives:** archived copies of repeating tasks (§9.9) appear here and are marked `↻`.

### 9.7 Optional notes

- **While editing a title:** a quiet `+ NOTE` affordance sits at the right edge of the editing row. Tapping it (or `≡ NOTE` on the accessory bar, or typing `//`) expands the notes field under the title and moves focus there.
- **Empty notes:** these leave no trace. No icon or extra space appears on the row.
- **In view mode:** tapping `≡` expands notes inline, and tapping the notes text edits it.
- **Links:** URLs in notes are tappable and open in the system browser.

### 9.8 Due dates and reminders

**Setting a date:**
- Dates and reminders are optional and off by default. You can set one from the accessory bar `⏰`, the context menu, shorthand, or an editing-row chip.
- **Picker sheet:**
  - Presets: `IN 1H`, `TONIGHT 20:00`, `TOMORROW 09:00`, `NEXT MON 09:00`.
  - A `CUSTOM…` option opens the native picker.
  - A `NOTIFY` toggle (default from settings) and a `REPEAT…` row (§9.9).
- **Permissions:** request notification permission **only the first time** you turn on a notification. If denied, show an inline note with a button to open system settings. The date still works without it.

**Notifications:**
- The title is the task title, and the body is the breadcrumb path (`WORK / Release notes`).
- **Action buttons:**
  - `DONE` and `SNOOZE 15M`, which go through the external ops queue (§6.4).
  - Tapping the notification body deep-links to the task and highlights it, zooming if needed.

**Lifecycle:**
- Completing, deleting, or clearing a task cancels its notifications, including cascades.

**Reconciliation, on launch and on each foreground:**
1. Read all OS-scheduled notifications.
2. Cancel orphans.
3. Reschedule any missing future ones.

**Overdue tasks:** a task past its due date and not done shows its time in `accent` with an `OVERDUE` tag.

**Android specifics (built now):**
- Create a `reminders` channel with high importance.
- Request exact-alarm permission on Android 12+. Without it, reminders may be a few minutes late, and Settings says so.
- Use a boot receiver to restore reminders after a restart.

**iOS specifics (logged in `IOS_PORT.md`):**
- iOS allows 64 pending notifications per app. Schedule only the nearest 60 and top up during reconciliation.

### 9.9 Recurring tasks

**Rules:**
- A repeat rule requires a due date. Picking a repeat without one sets the date to the next occurrence at the default time.
- **Picker options:**
  - Daily, Weekdays, Weekly (choose days), Monthly, Yearly, or Custom ("every N days/weeks/months").
  - A toggle chooses whether to repeat **from the schedule** (default) or **after completion**.

**What happens on completion:**
- **Top-level repeating task:**
  1. A **completed copy** of the task and its subtree is archived to COMPLETED, with `repeatSourceId` set.
  2. The live task stays in place in ACTIVE.
  3. Its `dueAt` advances to the next occurrence.
  4. Its subtree resets to unchecked.
  5. The row plays the strikethrough, then "un-strikes" with the new date chip (`NEXT: TUE 09:00`).
- **Repeating subtask:** it advances in place (strike, then reset with the new date). It is not archived.

**Date math:**
- **Missed occurrences:** completing an overdue repeating task jumps to the **next future** occurrence. It never creates a backlog.
- **Calendar arithmetic** uses local dates, so 9:00 stays 9:00 across daylight-saving changes.
- **Month-end clamping:** a monthly repeat on the 31st lands on the last day of shorter months.

**Other details:**
- **Stopping a repeat:** "Stop repeating" in the context menu removes the rule and keeps the date.
- **Notifications:**
  - On Android, the next occurrence is scheduled on completion, including completion from the widget or a notification via the headless task.
  - On iOS, the next **3** occurrences are pre-scheduled so a repeat keeps notifying even if the app isn't opened.
- **`lib/recurrence.ts`** is pure, about 150 lines, and heavily tested.

### 9.10 Drag-and-drop (reorder and re-nest)

**Gesture:**
1. **Long-press** a row (300 ms) and it lifts: `surfaceRaised` background, focus glow, slight scale (1.02), and a selection haptic.
2. **Release without moving** (< 8 pt) to open the context menu instead.
3. **Move vertically** to choose the position. Other rows slide out of the way with 120 ms animations.
4. **Move horizontally** to choose the depth, snapping every 20 pt.
   - The valid depth range is from the next row's depth up to the previous row's depth + 1.
   - A **drop indicator** (a 2 pt `accent` line starting at the target depth's indent) shows exactly where the task will land.
5. **Release** to drop. This is one undoable `move` op, with a selection haptic each time the target changes.

**During the drag:**
- **Children travel with their parent.** On lift, the subtree collapses into the lifted row, with a `+N` badge.
- **Auto-scroll** kicks in near the top and bottom edges, with speed proportional to distance into the edge zone.
- **Hover to expand:** hovering over a collapsed parent for 600 ms expands it so you can drop inside.
- **Invalid targets** (a task's own descendants) are impossible by construction, since the subtree collapses on lift.

**Implementation:**
- The gesture uses Gesture Handler Pan with `activateAfterLongPress(300)`, while Reanimated shared values drive a `DragLayer` overlay rendering a copy of the row.
- Row heights are cached from `onLayout` per id, so variable-height rows (with notes or multiline titles) compute targets correctly.
- `lib/dnd.ts` turns a pointer position into a target `{ parentId, index, depth }`. It is pure and unit-tested.
- Drag is disabled while editing, while search or filter is active, and on the COMPLETED tab.

**Accessibility:** "Move up", "Move down", Indent, Outdent, and "Move to…" are available as accessibility actions, so drag is never the only way.

### 9.11 Search and filter

- **Search:**
  - Tap `⌕` to search incrementally (case- and accent-insensitive, debounced at 120 ms) across titles and notes in the current tab.
  - Matches show with their **ancestors** (dimmed), so results keep the tree shape. Matched text is highlighted in `accent`.
- **ACTIVE filter chips:**

| Chip | Shows |
|---|---|
| `ALL` | Everything |
| `!!!` | High priority |
| `DUE` | Has a due date |
| `OVERDUE` | Past due and not done |
| `↻` | Repeating |

- **Clearing** restores the previous scroll position.

### 9.12 Priority

- Priority shows as `!`, `!!`, or `!!!` after the title, colored `textDim`, `text`, and `accent`.
- You can set it from the accessory bar (`! PRI` cycles), the context menu, a chip, or shorthand.
- **Per-parent sort:** the context menu includes "Sort children: Priority / Due date / A–Z". This is a one-time reorder (undoable), so manual order is never lost.

### 9.13 Undo / redo

- **Scope:** every mutation is a typed op in `ops.ts` with a computed **inverse**. History is a ring buffer of 100 ops, in memory only.
- **Batching:** typing coalesces into one entry per editing session per field.
- **Undo toast:** delete, cascade complete, move to COMPLETED, drag, clear, paste, sort, and import each show a toast with `UNDO` for 5 seconds.
- **Accessory bar:** `↶` undoes and long-press redoes.
- **External ops** (widget and notification actions) are undoable once the app is open. The toast reads `COMPLETED FROM WIDGET · UNDO`.

### 9.14 Bulk actions (multi-select)

- **Entering select mode:** choose **Select** from the context menu. The header becomes `3 SELECTED` with actions:

| Action | Effect |
|---|---|
| `DONE` | Complete the selected tasks |
| `PRI` | Set priority |
| `DUE` | Set a due date |
| `MOVE` | Move to another parent |
| `GROUP` | Wrap the selection in a new parent task, then edit its title |
| `DEL` | Delete |

- **Selection rule:** selecting a parent includes its subtree.

### 9.15 Move to…

- A searchable picker shows the active tree as an indented list. Choose a destination parent, or `TOP LEVEL`, and the task (with its subtree) moves to the end of that parent.
- A task's own descendants are disabled as targets.

### 9.16 Trash

- Deleted tasks stay in Trash for 7 days. Settings → Trash offers `RESTORE` and `DELETE NOW` per item, plus `EMPTY TRASH`.
- A restored task returns to its original parent and position when possible, or to the top level.

### 9.17 Settings

| Section | Settings |
|---|---|
| **Behavior** | Notify by default when a date is set · Default time (09:00) · Swipe actions on/off · Auto-clear completed (Off / 30 / 90 days, default Off) |
| **Feel** | Boot sequence on/off · Haptics on/off · Reduce motion (follows the OS by default) |
| **Notifications** | Permission status · Exact alarms status (Android) · Open system settings |
| **Data** | Export JSON · Import JSON (merge or replace, with a preview of counts before confirming) · Restore from snapshot (last 3 days) · Trash |
| **Help** | Gestures and shorthand reference · What's new · Version and build number |

Checking a parent always completes its subtasks, parents always auto-complete, and completed subtasks are always visible. These were decided as fixed behavior, not settings.

### 9.18 Haptics (can be turned off in Settings)

| Event | Haptic |
|---|---|
| Check / uncheck | Light impact |
| Swipe passes threshold | Selection tick |
| Drag lift / target change / drop | Selection tick |
| Top-level task completed | Success notification |
| Delete | Medium impact |

### 9.19 Empty states, first run, and beta niceties

- **Empty states:**
  - **ACTIVE:** `> NO ACTIVE QUESTS. TYPE BELOW TO BEGIN█`, with the quick-add bar focused on first launch.
  - **COMPLETED:** `> NOTHING COMPLETED YET.`
- **First-run tips:** one-line hint toasts, each shown once:
  1. "Tap any task to edit"
  2. "Enter adds the next task · empty Enter outdents"
  3. "Long-press to drag · hold still for more"
  4. "Swipe right to complete"
- **Sample data:** a "Load example tasks" button on the empty state creates a small demo tree.
- **What's new:** after an update, a one-time terminal-style changelog screen appears (from `CHANGELOG.md`, bundled), so testers know what changed. It is skippable.

### 9.20 Platform integration

- **App icon quick action:** long-press the icon for **New task**, which opens with the quick-add bar focused.
- **Deep links:** `questlog://task/<id>` opens and highlights a task. It is used by notifications and the widget.
- **App icon (placeholder):**
  - The text `<|->` in JetBrains Mono Bold, `accent` green, centered on pure black.
  - Generate it with a small script (`scripts/make-placeholder-icon.sh`, using ImageMagick in WSL) into `/assets/icon/`: a 1024 px icon, an Android adaptive-icon foreground on a black background, and a monochrome version for Android 13+ themed icons.
  - The dev variant adds a small `DEV` label, so the two installs are easy to tell apart.
  - Your own icon replaces these files later, with no code changes.
- **System chrome:**
  - Black splash screen with a green `<|->` and no white flash.
  - Light status bar content.
  - Black Android navigation bar.
  - Android 12+ splash API configured to match.
- **Orientation:** portrait only. Layouts tolerate split-screen through a 640 pt max content width.

---

## 10. Motion Spec

| # | Animation | Spec |
|---|---|---|
| 10.1 | **Boot sequence** | Lines type at about 8 ms per character (≤ 1.2 s total) **in parallel** with app readiness: `> quest_log v1.0` · `> MOUNTING /quests ...... OK` · `> 12 ACTIVE · 1 OVERDUE` · `> READY█`. It shows on cold start only, is skippable by tap, never shows with Reduce Motion, and exits with a 160 ms fade. |
| 10.2 | **Cursor blink** | A block `█` in `accent` at a 530 ms interval, using one shared Reanimated value for every block cursor. |
| 10.3 | **Strikethrough** | 200 ms draw with a color fade in parallel. |
| 10.4 | **Move to COMPLETED** | 500 ms hold after the strike, a 200 ms row collapse, and a tab counter glow pulse. |
| 10.5 | **Repeat advance** | Strike draws (200 ms), holds 300 ms, un-draws (200 ms), and the date chip crossfades to the new date. |
| 10.6 | **Row insert / delete** | 120 ms height expand or collapse with fade. |
| 10.7 | **Collapse / expand** | Caret rotates 90° over 120 ms. With more than 50 children, skip the animation. |
| 10.8 | **Drag** | Lift 120 ms (scale 1.02 + glow). Rows shift 120 ms. The drop settles in 160 ms. |
| 10.9 | **Focus glow** | Fades in over 120 ms. |
| 10.10 | **Toast** | Slides up 16 pt with fade over 200 ms, holds 5 s. |
| 10.11 | **Highlight-on-open** | The task's background flashes to `surfaceRaised` twice over 800 ms. |

All animations run on the UI thread via Reanimated worklets.

---

## 11. Home Screen Widget

### 11.1 Behavior

- **Sizes:** small (2×2), medium (4×2), and large (4×4).
- **Content:**
  - A header `> quest_log` with the active count, plus a `+` button that opens the app with quick-add focused.
  - The top active tasks, ordered by overdue first, then due today, then high priority, then manual order. Small shows 3, medium 4, and large 8.
  - Each row has a tappable `[ ]` that completes the task from the home screen, and a title that deep-links to the task.
- **Style:** the same black background, green tokens, and JetBrains Mono as the app.

### 11.2 Data flow

- **Snapshot:** the app writes a compact `widget.snapshot` (up to 8 tasks, plus counts and a timestamp) on every relevant change, throttled to 2 s, and asks the OS to refresh the widget.
- **Taps:** widget checkbox taps append to `ops.pending` (§6.4) and optimistically update the snapshot so the widget responds instantly.
- **Scheduled refreshes:** at midnight (so "due today" rolls over) and when a notification fires.

### 11.3 Android (Phase 12)

- Use `react-native-android-widget`. The widget UI is written in JSX and rendered to native RemoteViews.
- A widget task handler (headless JS) drains `ops.pending` immediately, applying cascade, recurrence, notification rescheduling, and refresh.

### 11.4 iOS (Phase 15)

- Build a WidgetKit extension in SwiftUI, added through `@bacons/apple-targets`.
- Share data through an **App Group** container, configuring MMKV (or a small JSON file) in the group path.
- Interactive checkboxes use **App Intents** (iOS 17+). The intent writes to `ops.pending` and updates the snapshot, and the app drains the queue on launch or foreground.
- A tiny native module triggers widget reloads from JS. This is the most complex part of the iOS port, so budget accordingly.

---

## 12. Screen Schematics (wireframes)

### 12.1 ACTIVE tab

```
┌────────────────────────────────────┐
│ > quest_log_            ⌕    ⚙     │
│ 12 ACTIVE · 4 DONE TODAY · 1 OVERDUE│
├────────────────────────────────────┤
│ [ ACTIVE QUESTS·12 ][ COMPLETED·34 ]│  segmented tabs
├────────────────────────────────────┤
│ ALL  !!!  DUE  OVERDUE  ↻          │  filter chips
├────────────────────────────────────┤
│ ▾ WORK                     [3/5]   │  group header
│ │ [ ] Ship v2 build   !!!  ⏰ 17:00 │
│ │ ▾ [ ] Write release notes  ≡     │
│ │ │  [x] D̶r̶a̶f̶t̶ ̶c̶h̶a̶n̶g̶e̶l̶o̶g̶          │  done subtask stays in place
│ │ │  [ ] Proofread                  │
│ │ [ ] Weekly review  ↻ FRI 16:00   │
│ ▸ HOME                     [1/4]   │
│ [ ] Call the bank  !!  OVERDUE     │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ > new task█                    │ │  quick-add bar
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

### 12.2 COMPLETED tab

```
┌────────────────────────────────────┐
│ > quest_log_            ⌕    ⚙     │
├────────────────────────────────────┤
│ [ ACTIVE·12 ][ COMPLETED QUESTS·34 ]│
├────────────────────────────────────┤
│                         CLEAR…     │
│ ▸ [x] Plan trip            2h      │  sorted: modified, newest first
│ ▸ [x] Weekly review ↻   YESTERDAY  │  archived repeat copy
│   [x] Renew passport      MAR 14   │
│ ▸ [x] Move apartment      MAR 02   │
│                                    │
│  swipe → RESTORE   ← DEL           │
└────────────────────────────────────┘
```

### 12.3 Editing a task (keyboard open)

```
┌────────────────────────────────────┐
│ ▾ WORK                     [3/5]   │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ [ ] Ship v2 build|      + NOTE ┃ │  surface bg + focus glow
│ ┃  !!! HIGH · ⏰ TODAY 17:00 · ↻ ✕┃ │  chips (tap to edit, ✕ clears)
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
├────────────────────────────────────┤
│ ⇤ OUT ⇥ IN ! PRI ≡ NOTE ⏰ DUE ↶     │  accessory bar (pinned)
├────────────────────────────────────┤
│           [ keyboard ]             │
└────────────────────────────────────┘
```

### 12.4 Editing with notes expanded

```
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ [ ] Write release notes        ┃ │
│ ┃ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ┃ │
│ ┃ // mention the sync fix and   |┃ │  auto-grows to 8 lines,
│ ┃ // credit the beta testers     ┃ │  then scrolls
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
```

### 12.5 Dragging (re-nesting)

```
│ ▾ WORK                     [3/5]   │
│ │ [ ] Ship v2 build   !!!          │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  drop indicator at depth 1
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃ ⋮ [ ] Write release notes  +2 ┃  │  lifted row: glow, +2 children
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │  ← drag sideways to change depth
│ │ [ ] Weekly review  ↻             │
```

### 12.6 Long-press context menu (bottom sheet)

```
┌────────────────────────────────────┐
│ > Ship v2 build                    │
│ ────────────────────────────────── │
│ + Add subtask                      │
│ ⇥ Indent        ⇤ Outdent          │
│ ! Priority  [ — ][ ! ][ !! ][ !!! ]│
│ ⏰ Due / remind…    ↻ Repeat…        │
│ ⤢ Zoom into        ☐ Select         │
│ ⧉ Duplicate        ↦ Move to…      │
│ ⎘ Copy as text                     │
│ ✕ Delete                           │
└────────────────────────────────────┘
```

### 12.7 Zoomed into a subtree

```
┌────────────────────────────────────┐
│ ← ALL / WORK / Release notes       │  tappable breadcrumb
│ 2 OPEN · 1 DONE                    │
├────────────────────────────────────┤
│ [x] D̶r̶a̶f̶t̶ ̶c̶h̶a̶n̶g̶e̶l̶o̶g̶                 │
│ [ ] Proofread                      │
│ [ ] Send to team                   │
└────────────────────────────────────┘
```

### 12.8 Home screen widget (medium 4×2)

```
┌──────────────────────────────────────┐
│ > quest_log          12 ACTIVE    +  │
│ [ ] Call the bank          OVERDUE   │
│ [ ] Ship v2 build   !!!      17:00   │
│ [ ] Weekly review   ↻     FRI 16:00  │
│ [ ] Proofread                        │
└──────────────────────────────────────┘
```

### 12.9 Boot sequence

```
┌────────────────────────────────────┐
│                                    │
│ > quest_log v1.0                   │
│ > MOUNTING /quests ......... OK    │
│ > 12 ACTIVE · 1 OVERDUE            │
│ > READY█                           │
│                                    │
│            tap to skip             │
└────────────────────────────────────┘
```

---

## 13. Accessibility

- **Screen readers:**
  - Each row has an `accessibilityLabel` like "Ship v2 build, high priority, due today 5 PM, repeats weekly, not done, 2 of 5 subtasks done."
  - The checkbox uses `accessibilityRole="checkbox"` with a checked state.
  - Tabs use `accessibilityRole="tab"` with a selected state.
  - Rows expose **custom accessibility actions**: Complete, Delete, Edit, Add subtask, Indent, Outdent, Move up, Move down, and Move to. VoiceOver and TalkBack users never need swipes, long-press, or drag.
- **Visual:**
  - Contrast follows §8.1, with all text at AA or better.
  - Dynamic type is supported up to 1.6x.
- **Motion and input:**
  - Reduce Motion is honored everywhere.
  - Hit targets are at least 44 pt.
  - Focus returns to the right place after closing sheets.
- **Widget:** the widget has accessible labels per row.

---

## 14. Project Structure

```
/app                          # Expo Router
  _layout.tsx                 # fonts, theme, hydration, migrations, ops drain, boot
  index.tsx                   # List screen (ACTIVE / COMPLETED tabs)
  settings.tsx  trash.tsx  help.tsx  whats-new.tsx
/components
  list/
    TaskList.tsx              # FlashList wrapper, getItemType by row kind
    TaskRow.tsx               # memo, subscribes to byId[id] only
    CompletedRow.tsx
    GroupHeader.tsx  NestingGuides.tsx  Strikethrough.tsx  Checkbox.tsx
    DragLayer.tsx             # lifted row overlay + drop indicator
  edit/
    InlineEditor.tsx  NotesField.tsx  ParsedChips.tsx
    AccessoryBar.tsx  QuickAddBar.tsx
  overlays/
    ContextMenu.tsx  DueSheet.tsx  RepeatSheet.tsx  MovePicker.tsx
    Toast.tsx  BootSequence.tsx
  common/
    Header.tsx  Tabs.tsx  FilterChips.tsx  Breadcrumb.tsx
    SearchField.tsx  BlockCursor.tsx
/store
  index.ts  tasksSlice.ts  uiSlice.ts  historySlice.ts  settingsSlice.ts
  selectors.ts                # activeRows, completedRows, counts
  persist.ts                  # MMKV adapter, throttle, flush, snapshots
  migrations/
/lib                          # pure, no React, fully unit-tested
  tree.ts  flatten.ts  ops.ts  parser.ts  recurrence.ts
  dnd.ts  paste.ts  search.ts  dates.ts
/services
  notifications.ts            # schedule, cancel, reconcile, categories, actions
  externalOps.ts              # ops.pending queue: append, drain (idempotent)
  widget.ts                   # snapshot build + refresh request
  haptics.ts  backup.ts
/widgets
  android/
    QuestWidget.tsx           # react-native-android-widget UI
    widgetTaskHandler.ts      # headless: drain queue, refresh
/targets
  widget/                     # iOS WidgetKit extension (Swift), Phase 15
/theme
  colors.ts  typography.ts  spacing.ts  motion.ts  platform.ts  index.ts
/scripts
  seed.ts                     # 1,000 active + 5,000 completed fixture
  release-android.sh          # test → build → verify → checksum → GitHub release
  make-placeholder-icon.sh
/e2e
  android/*.yaml              # Maestro flows
  ios/*.yaml                  # Phase 15
/__tests__
  fixtures/                   # saved data from each beta version (migrations)
/assets
  icon/                       # placeholder <|-> icons (replaced by your design later)
  fonts/
/plugins
  withReleaseSigning.js       # wires the local keystore into the Gradle release build
version.json                  # versionName + versionCode, the single source of truth
app.config.ts                 # reads APP_VARIANT (dev | release)
IOS_PORT.md  CHANGELOG.md  PERF.md  RELEASING.md  INSTALL.md
# android/ and ios/ are generated by `expo prebuild` and not committed
```

---

## 15. Build, Distribution, and the iOS Port

Everything here runs on your own machine. There are no Expo accounts, cloud builds, or over-the-air updates. Android builds happen in WSL Ubuntu, and each release is a signed APK attached to a GitHub Release.

### 15.1 Local build environment (Windows 11 + WSL Ubuntu)

**Install inside WSL (not on Windows):**

| Tool | Notes |
|---|---|
| Node.js LTS | Install with `nvm`. Use the same version in `.nvmrc`. |
| JDK 17 | `sudo apt install openjdk-17-jdk`. This is the version React Native's Gradle setup expects. |
| Android SDK command-line tools | Install to `~/Android/Sdk`, then use `sdkmanager` for `platform-tools`, the build-tools, and the platform matching the Expo SDK. Set `ANDROID_HOME` and add `platform-tools` to `PATH` in `~/.bashrc`. |
| Git and GitHub CLI | `gh` publishes releases from the terminal (§15.5). |
| ImageMagick | Generates the placeholder icon (§9.20). |
| Maestro | E2E tests (§14). |

**Workspace rules:**
- Keep the project **inside the WSL filesystem** (for example `~/projects/quest_log`), never under `/mnt/c/`. Builds on the Windows drive are many times slower and file watching breaks.
- Open it in VS Code with the **WSL extension** (`code .` from the WSL terminal), so the editor, terminal, and tools all run in Ubuntu.
- Give WSL enough memory for Gradle in `%UserProfile%\.wslconfig` (for example `memory=8GB`), and set `org.gradle.jvmargs=-Xmx4g` in `~/.gradle/gradle.properties`.

**Testing on your phone (primary target):**
- Turn on `networkingMode=mirrored` in `.wslconfig`. WSL then shares the Windows network, so the phone, `adb`, and the Metro dev server can all reach each other.
- Use Android 11+ **Wireless debugging**: `adb pair <ip>:<port>` once, then `adb connect <ip>:<port>`.
- USB also works, through `usbipd-win`, which forwards the phone from Windows into WSL.
- An emulator is optional. If you want one, run it from Android Studio **on Windows** (hardware acceleration works there), and `adb` in WSL connects to it over the mirrored network.

### 15.2 Build variants

`app.config.ts` reads `APP_VARIANT` and produces two apps that install **side by side**, so your daily dev build never touches your real test install:

| | `dev` | `release` |
|---|---|---|
| Package | `com.<you>.questlog.dev` | `com.<you>.questlog` |
| App name | `quest_log DEV` | `quest_log` |
| Icon | `<|->` with a `DEV` label | `<|->` |
| JS | Loaded live from Metro on your machine (fast refresh) | Bundled into the APK as Hermes bytecode |
| `INTERNET` permission | Kept (needed to reach Metro) | **Removed** by a config plugin that marks it `tools:node="remove"` |
| Minification | Off | R8 and resource shrinking on, arm64-only APK |
| Signing | Debug key | Your release key (§15.3) |

**Commands:**
- Daily work: `APP_VARIANT=dev npx expo run:android --device`
- Release build: `APP_VARIANT=release npx expo prebuild --clean --platform android`, then `cd android && ./gradlew assembleRelease`. The release script (§15.5) wraps this.

The `android/` and `ios/` folders are generated by `expo prebuild` and never edited by hand. All native changes go through config plugins in `/plugins`, so a clean prebuild always reproduces the same app.

### 15.3 Signing key (critical)

Android only installs an update over an existing app if **both are signed with the same key**. If the key is lost, friends must uninstall to update, and uninstalling deletes their tasks.

1. Generate the key once, in Phase 1:
   `keytool -genkeypair -v -keystore ~/.quest_log/release.keystore -alias questlog -keyalg RSA -keysize 4096 -validity 10000`
2. Keep the keystore **outside the repo**. Store its passwords in `~/.gradle/gradle.properties` (never committed). The `withReleaseSigning` plugin reads them at build time.
3. **Back up the keystore and passwords in two places**, for example a password manager and an encrypted USB drive.
4. Add `*.keystore`, `*.jks`, and `android/`, `ios/` to `.gitignore`.
5. Print the certificate's SHA-256 fingerprint once (`apksigner verify --print-certs`) and include it in `INSTALL.md`, so friends can confirm an APK came from you.

### 15.4 Versioning

- `version.json` is the single source of truth: `versionName` uses semver (`0.x.y` during beta, `1.0.0` at launch), and `versionCode` is an integer that **must increase** with every build friends install.
- The release script bumps both and commits the change.
- Help shows `v0.3.0 (build 12)`, and the What's new screen appears once after each update.
- `CHANGELOG.md` has one section per version. It feeds both the What's new screen and the GitHub Release notes.

### 15.5 Release process (`scripts/release-android.sh`)

The script has two commands, matching your "I test it first, then friends get it" flow.

**`./scripts/release-android.sh build [patch|minor|major]`**
1. Check that the git working tree is clean.
2. Run `tsc --noEmit`, ESLint, and Jest. Stop on any failure.
3. Bump `version.json` and require a matching `CHANGELOG.md` section.
4. Clean prebuild with `APP_VARIANT=release`, then `./gradlew assembleRelease`.
5. **Verify the APK:**
   - `apksigner verify` passes and the certificate fingerprint matches the one in `INSTALL.md`.
   - `aapt2 dump permissions` shows **no `INTERNET` permission**.
   - The file is under the §5 size budget.
6. Rename it `quest_log-v0.3.0.apk` and write `quest_log-v0.3.0.apk.sha256`.
7. Install it on your phone with `adb install -r` (keeps data, like a friend's update would).
8. Commit, tag `v0.3.0`, and create a **draft** GitHub Release with `gh release create --draft`, attaching the APK and checksum and using the changelog section as notes. Drafts are visible only to you.

**You test the build.** Use it on your phone as long as you like. If something is wrong, delete the draft, fix it, and build again.

**`./scripts/release-android.sh publish v0.3.0`**
- Runs `gh release edit v0.3.0 --draft=false --prerelease` (pre-release while in `0.x`).
- Prints the two links to send friends: the release page, and the direct APK download link (`https://github.com/<you>/<repo>/releases/download/v0.3.0/quest_log-v0.3.0.apk`).

**Repository visibility:** downloading release files from a **private** repo requires a GitHub login with access. Either make the repo public, or keep the source private and publish APKs to a separate public `quest_log-releases` repo (the script takes the target repo as a setting). See §18.

`RELEASING.md` documents all of this, including how to restore the signing setup on a new computer.

### 15.6 Installing and updating (Android, for friends)

`INSTALL.md` (also linked in every release's notes) walks friends through:

1. Open the APK link on the phone and download it.
2. Allow the browser to install apps when Android asks ("Install unknown apps" → allow for this browser). This is a one-time step.
3. If Play Protect warns about an unrecognized app, choose **More details → Install anyway**. This happens because the app isn't from the Play Store.
4. Open quest_log.

**Updating:**
- Open the new link and install the new APK **over** the old one. Tasks and settings are kept.
- **Never uninstall first.** Uninstalling deletes the app's data. If in doubt, use Settings → Export first.
- The app never checks for updates. You tell friends when a new version is out.

**Compatibility:** the minimum Android version is whatever the chosen Expo SDK supports (typically Android 7+). Release APKs are arm64-only for size, which covers essentially every phone from the last several years. If a friend has an older 32-bit phone, the script can also produce a universal APK.

### 15.7 iOS readiness during Android development

`IOS_PORT.md` is a running checklist. Seed it with:

- **Build machine:** iOS apps can only be built with **Xcode on macOS**. WSL and Windows can't do it. Before Phase 15, arrange one of: a Mac (your own or borrowed), a rented remote Mac, or a macOS CI runner.
- **Notifications:** 64-pending cap, so schedule the nearest 60 and pre-schedule 3 repeat occurrences.
- **Permissions:**
  - Request notification permission with iOS's provisional-auth consideration.
  - Write the Info.plist usage strings.
- **Widget:** WidgetKit extension, App Group, App Intents (iOS 17+), and the reload native module.
- **Notification actions:** the app drains the queue on foreground, since there is no headless task.
- **Keyboard:** verify the accessory bar with the iOS keyboard and the predictive bar.
- **Gestures:**
  - The edge-swipe back gesture must not conflict with row swipes; set a left-edge exclusion zone.
  - Long-press must not trigger iOS text-selection magnifiers on non-editing rows.
- **Fonts and haptics:**
  - Check glyph rendering (`⏰`, `↻`, box-drawing) in JetBrains Mono.
  - Map haptics to iOS feedback generators.
- **Safe areas:** home indicator and Dynamic Island.
- **Offline:** iOS has no internet permission to remove, so the guarantee comes from the code itself: no network libraries, verified by a dependency audit in Phase 15.

### 15.8 iOS distribution (decide before Phase 15)

Apple does not allow installing an app file from a plain download link the way Android does. Every option involves Apple in some way. Pick one before starting Phase 15:

| Option | How friends install | Cost / limits | Closest to the APK flow? |
|---|---|---|---|
| **Ad Hoc via GitHub** | You host the signed `.ipa` and a small `manifest.plist` (for example on GitHub Pages). Friends open an `itms-services://` link in Safari and install. | Paid Apple Developer Program. Each friend's iPhone must be registered first (UDID), up to 100 devices per year. Builds expire with the provisioning profile (about a year). | **Yes**, a direct link you send. |
| **TestFlight** | Friends install Apple's TestFlight app and open your invite link. | Paid Apple Developer Program. Each build expires after 90 days. A public link needs a light Apple beta review. | Partly. Easiest for friends, but goes through Apple. |
| **Free sideload** (AltStore, Sideloadly) | Friends download the `.ipa` from GitHub and install it with a tool on their computer, using their own Apple ID. | Free. The app expires every 7 days and must be refreshed. Some capabilities, such as the widget's App Group, may be limited with free accounts; check before choosing. | Same download, much more hassle. |

Whatever the choice, the release script gets an iOS counterpart that attaches the `.ipa` (and manifest, for Ad Hoc) to the same GitHub Release as the APK.

---

## 16. Build Phases

| # | Phase | Deliverable / exit criteria |
|---|---|---|
| 1 | **Foundation** | WSL toolchain set up (§15.1). `dev` and `release` variants (§15.2). Dev build running on your phone over wireless debugging. Release keystore generated and backed up (§15.3). Placeholder `<|->` icon. **A first signed release APK builds and installs**, proving the pipeline early. Theme tokens, fonts, black splash, system bar styling, glyph check. ESLint, TypeScript, Jest, and `IOS_PORT.md` set up. |
| 2 | **Pure core** | `tree`, `flatten`, `ops` with inverses, and `dates`, fully unit-tested. |
| 3 | **Store and persistence** | Slices, MMKV persist with throttle and flush, migration scaffold with fixture tests, daily snapshots, seed script. Data survives a kill and relaunch. |
| 4 | **List and editing** | FlashList tree, rows, group headers, guides, collapse. Single-editor inline editing with full outliner keys, quick-add bar, and paste-to-tree. Profiler confirms no stray re-renders. |
| 5 | **Completion and tabs** | Strikethrough, cascade down and auto-complete up, ACTIVE/COMPLETED tabs with the move animation, COMPLETED sort and actions (Restore, Run again, Clear), swipes, haptics, undo/redo with toast. |
| 6 | **Notes, priority, shorthand** | `+ NOTE` and `//` notes, priority, `parser.ts` with live chips, accessory bar, context menu. |
| 7 | **Due dates and reminders** | Due sheet, notify toggle, permissions, scheduling, Done and Snooze actions via the external ops queue, deep links, reconciliation, Android channel, exact alarms, boot receiver. |
| 8 | **Recurring tasks** | `recurrence.ts` (daylight-saving and month-end tests), repeat sheet and shorthand, archive-copy and advance behavior, notification rescheduling. |
| 9 | **Drag-and-drop** | `dnd.ts`, DragLayer, depth by horizontal drag, auto-scroll, hover-to-expand, undo, accessibility move actions. 60 fps with the seed. |
| 10 | **Navigation and power features** | Zoom with breadcrumb, search and filter with ancestors (both tabs), multi-select, Move to…, Trash, per-parent sort. |
| 11 | **Polish** | Boot sequence, block cursor, focus glow, full motion pass, empty states, first-run tips, Help, What's new, accessibility labels and actions, app icon quick action. |
| 12 | **Android widget** | Three sizes, snapshot pipeline, interactive checkbox via the headless handler, midnight refresh, deep links. |
| 13 | **Settings and backup** | Every setting in §9.17, JSON export/import with validation and preview, snapshot restore, auto-clear. |
| 14 | **Android beta** | Maestro suite green. §5 budgets met and recorded in `PERF.md`. `release-android.sh` complete with all verification steps. `INSTALL.md` and `RELEASING.md` written. First draft release tested on your phone, then published and the link sent to friends. Iterate in `0.x` releases, with migration tests for every schema change. |
| 15 | **iOS port** | Distribution method chosen (§15.8) and a Mac available. Complete `IOS_PORT.md`, iOS widget, iOS Maestro suite, iPhone performance check, iOS release script, first iOS beta. |

---

## 17. Roadmap (post-v1, not in scope)

- **Optional sync:** an opt-in file in iCloud or Google Drive, with local staying the default.
- **Alternate palettes:** amber terminal and cyan, using the same token structure.
- **Custom block caret inside inputs:** ship only if it holds up with selection, autocorrect, and IME on both platforms.
- **Share extension:** "Share to quest_log" turns a link or text from any app into a task.
- **App lock:** fingerprint or Face ID.
- **Focus timer:** start a Pomodoro-style timer on any task.
- **Tablet and landscape layouts.**

---

## 18. Open Questions

1. ~~**Repository visibility**~~ **Decided (2026-10-07):** a single **public** repo, `THEDUNGEONS2077/quest_log`, holds both the source and the APK releases.
2. ~~**App ID**~~ **Decided (2026-10-07):** `com.thedungeons2077.questlog` (dev: `com.thedungeons2077.questlog.dev`).
3. **iOS distribution:** pick an option from §15.8 before Phase 15.
