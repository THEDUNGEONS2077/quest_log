# quest_log design system

The visual and interaction design of quest_log, written so it can be reused in another app. Every value here is the one the app actually ships (taken from `theme/` and the components). Where a choice came from user testing, the reason is given, so you can judge whether it applies to your app.

**Contents**
1. [Design principles](#1-design-principles)
2. [Color](#2-color)
3. [Typography](#3-typography)
4. [Spacing, sizing and shape](#4-spacing-sizing-and-shape)
5. [Iconography: glyphs instead of icons](#5-iconography-glyphs-instead-of-icons)
6. [Components](#6-components)
7. [Motion](#7-motion)
8. [Interaction and UX patterns](#8-interaction-and-ux-patterns)
9. [Accessibility](#9-accessibility)
10. [Voice and copy](#10-voice-and-copy)
11. [Platform notes (Android, iPhone web app)](#11-platform-notes)
12. [Drop-in tokens (TypeScript and CSS)](#12-drop-in-tokens)
13. [Checklist for a new screen](#13-checklist-for-a-new-screen)

---

## 1. Design principles

The look is a **cyberdeck terminal**: green phosphor on pure black, one monospace font, text glyphs for icons. The UX underneath is that of a fast, forgiving native app.

1. **Terminal look, app ergonomics.** The style comes from a terminal (`>` prompts, `█` cursor, `[ ]` checkboxes, uppercase status lines). The behaviour doesn't: tap targets are 44 pt or larger, gestures work everywhere, and nothing needs typed commands.
2. **One hue.** Everything is green on black. Hierarchy comes from **brightness, weight, size and case**, never from a second color. Destructive actions are marked by label and glyph (`✕ DEL`), not red.
3. **Forgiving over cautious.** Actions happen immediately and offer **UNDO** for 5 seconds. Confirmation dialogs are almost never used.
4. **What you're typing is always visible.** The keyboard and toolbars never cover the text being edited (marked *critical* in user testing).
5. **Controls live at the bottom**, within thumb reach: the quick-add bar, the editing toolbar, sheets and toasts.
6. **Calm density.** Rows are generous (52 pt minimum), details sit on their own line under the title, and dividers separate top-level items.
7. **Accessible by construction.** All text meets WCAG AA, every gesture has a screen-reader action, text scales with the system, and Reduce Motion is honoured.
8. **One effect only:** a soft green glow for focus. There are no other shadows, gradients or blurs.

---

## 2. Color

### Palette

| Token | Hex | Role |
|---|---|---|
| `bg` | `#000000` | App background (pure black; also the splash and status bar) |
| `surface` | `#060D08` | Editing row, sheets, input fields, toast, pressed state |
| `surfaceRaised` | `#0B160D` | Context menus and sheets, selected rows, the lifted drag row, pressed state on surfaces |
| `line` | `#12301A` | Hairline borders and dividers (decoration only, never text) |
| `textDim` | `#2B903F` | Completed items, metadata, placeholders, hints, notes |
| `text` | `#2FB344` | Body text, icons, labels |
| `accent` | `#39FF14` | Focus, the caret, active controls, high priority, the drop indicator, primary buttons, the `>` prompt |
| `textBright` | `#B6FFB0` | Headings, top-level titles, the active tab, toast text |

### Contrast (WCAG 2.x, measured)

| Text token | on `bg` | on `surface` | on `surfaceRaised` |
|---|---|---|---|
| `textDim` | 5.2 : 1 | 4.8 : 1 | 4.6 : 1 |
| `text` | 7.7 : 1 | 7.2 : 1 | 6.7 : 1 |
| `accent` | 15.5 : 1 | 14.5 : 1 | 13.6 : 1 |
| `textBright` | 17.9 : 1 | 16.8 : 1 | 15.8 : 1 |

Every text token passes AA (4.5:1) on every background. `textDim` was brightened from `#2A8A3E` because that value fell to 4.2:1 on `surfaceRaised`. **Keep a test that enforces this** whenever tokens change; quest_log has one (`__tests__/theme.test.ts`).

### Usage rules
- **Never use hex values in components.** Only tokens.
- **Brightness encodes importance:** `textBright` for headings and top-level items, `text` for content, `textDim` for secondary information, `accent` for what's interactive or needs attention right now.
- **State changes are color shifts within green,** for example a priority ladder of `textDim` → `textDim` → `text` → `accent` for `!` `!!` `!!!`.
- **Overlays dim the screen** with black at 60% (`rgba(0,0,0,0.6)`).
- **Focus glow:** `accent` at 35% opacity, 6 px blur, no offset.
  - **Inset** (`inset 0 0 6px rgba(57,255,20,0.35)`) for things inside a list, where neighbours could cover an outer shadow.
  - **Outset** for floating things, such as a lifted drag row.

---

## 3. Typography

**One family:** [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (OFL licence) in Regular, Medium and Bold, subset to Latin, box-drawing characters and the glyphs in §5.

### Type roles

Components use a **role**, never a raw size.

| Role | Size / line height | Weight | Case | Use |
|---|---|---|---|---|
| `title` | 29 / 38 | Bold | as written (`<7>_quest_log`) | The main header (display +30%) |
| `display` | 22 / 30 | Bold | as written (lowercase `> settings`) | Screen titles |
| `tab` | 14 / 20 | Bold, +1 letter spacing | UPPERCASE | Tabs, buttons, setting values (`[ON ]`) |
| `group` | 14 / 20 | Bold | UPPERCASE | Top-level item titles, section headings |
| `body` | 17 / 24 | Regular | as written | Inputs, primary text, sheet titles |
| `subtask` | 15 / 22 | Regular | as written | Nested item titles |
| `meta` | 13 / 18 | Medium | mostly UPPERCASE | Counts, dates, tags, hints, toasts |
| `notes` | 15 / 22 | Regular | as written | Long text and help descriptions (in `textDim`) |
| `glyph` | 20 / 24 | Regular | | Icon glyphs next to body text (20% larger than body; same line height so rows stay aligned) |
| `caretGlyph` | 31 / 31 | Regular | | The ▸ collapse caret (users asked for it larger, three times) |
| `metaGlyph` | 16 / 18 | Medium | | Icon glyphs next to meta text |

### Rules
- **Hierarchy through case and weight before size.**
  - Top-level items are **14 pt UPPERCASE bold in `textBright`**. They're smaller than body text but read as headings.
  - Nested items are 15 pt mixed case.
  - Users chose this after trying larger caps: "decrease title text of groups by 20%".
- **Small text is nudged down** by half the line-height difference, so its first line aligns with the 24 pt glyphs beside it.
- **Text scaling:** honour the OS setting, capped at **1.6×** (`maxFontSizeMultiplier`). Test every screen at 1.6×. Long titles shrink or truncate (`numberOfLines={1}`) rather than push buttons off-screen.
- **Android:** `includeFontPadding: false` on all text, so monospace rows sit exactly on the 4 pt grid.
- **Avoid font sizes under 16 px in web inputs** (iOS zooms the page on focus). Body is 17.

---

## 4. Spacing, sizing and shape

### Spacing scale (4 pt grid)

| `xs` | `sm` | `md` | `lg` | `xl` |
|---|---|---|---|---|
| 4 | 8 | 12 | 16 | 24 |

Screen side padding is `lg` (16). The space between a control's glyph and its label is `sm`. Gaps between sections are `xl`.

### Sizes

| Token | Value | Notes |
|---|---|---|
| `hitTarget` | 44 | Minimum width and height of anything tappable (extend with `hitSlop` if the visual is smaller) |
| `rowMinHeight` | 52 | List rows, settings rows, sheet options |
| `indent` | 24 | Per nesting level |
| `maxVisualDepth` | 4 | Indentation stops here; deeper rows show a depth badge (`└5`) |
| `caretColumn` | 36 | The ▸ column, plus an **8 pt gap** before the checkbox |
| `toolbarHeight` | 56 | Bottom editing toolbar |
| `maxContentWidth` | 640 | Content is centred and capped on tablets and split-screen |

### Shape

| Token | Value |
|---|---|
| `radius` | 2 (nearly square: a terminal, not a bubble UI) |
| `hairline` | 1 (borders and dividers in `line`) |
| `strike` | 1.5 (strikethrough line thickness) |
| `dropIndicator` | 2 (drop line while dragging; selected-row left bar) |
| `checkboxTracking` | −4 letter spacing on `[ ]`, so the brackets read as one compact box |

---

## 5. Iconography: glyphs instead of icons

There's no icon font and there are no images. Every icon is a **text character in the same monospace font**, so icons inherit color, size and text scaling, and look native to the terminal style.

| Meaning | Glyph | | Meaning | Glyph |
|---|---|---|---|---|
| Checkbox off / on | `[ ]` `[x]` | | Add | `+` |
| Collapsed / expanded | `▸` (rotated 90° when open) | | Search | `/` (vim's search key) |
| Notes | `≡` | | Settings | `⊛` |
| Reminder | `◔` (reads as a clock) | | Help | `?` |
| Repeats | `↻` | | Delete / close | `✕` |
| Priority | `!` `!!` `!!!` | | Undo / redo | `↩` `↪` |
| Depth badge | `└5` | | Outdent / indent | `←` `→` |
| Prompt | `>` | | Move to | `↦` |
| Cursor | `█` (blinking) | | Done | `✓` |
| Save / load / share | `↧` `↥` `⇧` | | Copy / duplicate / select / zoom | `⎕` `⊞` `□` `⊕` |

**Rules**
- **Keep every glyph in one registry** (for example `glyphs.ts`), so one can be swapped app-wide.
- **Check that each glyph is in your font file.** A missing one falls back to a system font: not monospace, and possibly a color emoji. quest_log replaced `⏰ ⚙ ↶ ⌕` with in-font look-alikes (`◔ ⊛ ↩ /`).
- **Glyph buttons are square 44 pt boxes** with a hairline `line` border and radius 2. A labelled toolbar button stacks the glyph over an UPPERCASE `meta` label (`← OUT`, `+ SUB`, `✓ DONE`).
- **Bracketed text works as buttons:** `[ LOAD EXAMPLE TASKS ]`, `[ CONTINUE ]`, `[ON ]` / `[OFF]`.

---

## 6. Components

All measurements are in pt (dp on Android, px on the web).

### Header
```
<7>_quest_log                   [/][?][⊛]
12 ACTIVE · 4 DONE TODAY · 3-DAY STREAK
```
- **Title:** `<level>_quest_log` in the `title` role (29 / 38 bold, 30% larger than `display`). The brackets are `textDim`, the level `textBright`, the name `accent`. It shrinks to fit (down to 70%); the buttons never move.
- **Buttons:** 34 pt glyph boxes, 4 apart, at the top right; `hitSlop` keeps them 44 pt to tap.
- **Status line:** `meta`, `textDim`, items joined with ` · `. The day streak appears from 2 days.

### Tabs: quest categories plus a view switch
```
[  ALL  ][ DAILY ][ MAIN  ][ MISC  ]
    12       3       7        2
[ ACTIVE · 12      ][ COMPLETED · 34 ]
```
- **Quest tabs:** four equal segments, 52 pt tall, hairline border, radius 2. The label (`tab` role) sits over the count of open quests (`meta`).
  - **Selected:** `accent` border on `surface`, label in `textBright`, count in `accent`.
  - **Unselected:** both label and count in `textDim`.
- **View switch:** two equal halves, 28 pt drawn (44 to tap), with no frame, just a 2 pt bottom bar (`line`, or `accent` when selected). Label `LABEL · n` in `meta`. It reads as secondary to the tabs above.
- **The panel never changes height** between tabs: every tab has the switch.
- **New item:** when the COMPLETED count goes up, its number pulses to `textBright` (120 ms in, 320 ms out), so you see where the item went.

### XP bar (under the tabs)
```
[■■■■■■■■■■■■■■□□□□□□□□□□]  340/425 XP
```
- **Track:** 10 pt tall, hairline `line` frame, `surface` inside, radius 2.
- **Fill:** `accent` with the outset glow, split into 10 segments by 1 pt `bg` separators (a terminal gauge).
- **Label:** `into/needed XP` in `meta` `textDim`.
- **Opacity:** 80%, quieter than the tabs above it.
- **Gain:** the fill eases forward (320 ms), and a `+18` in `accent` floats up 12 pt and fades (1.2 s). On a level-up the fill runs to the end, then restarts from empty.
- **Screen readers:** `role=progressbar`, "Level 7: 340 of 425 XP to level 8".

### Quest meter (on a row with subtasks)
```
[▓▓▓▓▓░░░░ 3/5 · +58 XP]
```
- Replaces the plain `[3/5]`. A hairline frame (radius 2) whose background fills with `xpWash` (`#092903`: accent at 16% over black) as subtasks are checked.
- The count is in `textDim`, and the reward preview (`+58 XP`) in `text`, on top of the fill.
- The fill eases to each new value (320 ms).

### List row (the core component)
```
▾  [ ] SHIP V2 BUILD                [+]
       !!! ◔ FRI 16:00 [2/5]
    │  [x] Draft changelog
    │  [ ] Proofread
```
- **Layout:** 52 pt minimum height, 12 pt vertical padding. Left padding is 16 + depth × 24.
- **Columns:** caret (36) → 8 gap → checkbox (`[ ]` in `glyph`, 12 pt margin after) → title column (flex).
- **Details go on their own line under the title** (priority, notes `≡`, due date, progress `[2/5]`), wrapping as needed. *Why:* side-by-side details squeezed long titles into broken wraps.
- **The whole title column is the tap target,** not just the letters.
- **Top-level rows** get a hairline divider above them and 8 pt extra top margin, whether or not they have children, except the first row: it sits right under the top panel's fixed divider.
- **The top panel** (title, tabs, XP bar, search, breadcrumb) never scrolls. Its bottom hairline divider stays put while the list scrolls under it.
- **Nesting guides:** 1 pt vertical `line` hairlines, one per level, centred under each ancestor's caret column.
- **Quest `+` button:** every top-level task (a quest) has a bordered `+` on the right that adds an objective (subtask), from the moment it's created. While a quest is being edited, the `+` takes the place of `+ NOTE`. Every quest is meant to become a group.
- **States:**
  - *editing*: `surface` background plus the inset glow (fades in over 120 ms)
  - *selected*: `surfaceRaised` with a 2 pt `accent` bar on the left
  - *dimmed*: 40% opacity (search context rows, rows being dragged)
  - *done*: animated strikethrough and `textDim`
- **Screen readers:** one element per row, with a full spoken label ("Ship v2 build, high priority, due Friday 4 PM, repeats weekly, not done, 2 of 5 subtasks done") and **custom actions** for everything the gestures do.

### Swipe actions (on a row)
- **Swipe right:** `[x] DONE` is revealed on the left. **Swipe left:** `✕ DEL` is revealed on the right. Each passes a threshold with a selection haptic.
- Both are fully reversible through UNDO, and both can be turned off in Settings.

### Quick-add bar (bottom)
```
┌──────────────────────────────────┐
│ > new quest█                     │
└──────────────────────────────────┘
```
- **Placement:** pinned to the bottom, riding on top of the keyboard when it's open.
- **Field:** `surface` with a hairline `line` border, which turns `accent` when focused. The prompt `>` is in `accent`.
- **Idle state:** `new quest` plus a **blinking █ cursor** (a placeholder can't blink, so it's an overlay).
- **Enter adds the item and closes the keyboard.** Live chips above the field preview parsed shorthand.

### Editing toolbar (bottom, while editing)
```
 ←    →    +    !    ≡    ◔    ↩    ✓
OUT  IN  SUB  PRI NOTE DUE UNDO DONE
```
- 56 pt tall, `surface` background, sitting above the keyboard.
- Each button is a glyph over a `meta` label; the primary action (`✓ DONE`) is at the far right.

### Bottom sheet
```
> Ship v2 build
──────────────────────
⊕  Zoom into
↦  Move to…
⊞  Duplicate
✕  Delete
```
- **Sheet:** `surfaceRaised`, hairline top border, radius 2 at the top corners, 16 pt top padding, at most 85% of the screen height (scrolls if longer).
- **Title:** `> title` in `body`, `textBright`, at most 2 lines, then a hairline divider.
- **Options:** 52 pt rows with a 32 pt glyph column in `accent` and the label in `text`; pressed state is `surface`.
- **Opening:** the backdrop fades in while the sheet rises 72 pt and fades in, over 200 ms.
- **Closing:** tap outside or press back. The backdrop isn't a screen-reader element (it would swallow the sheet's text).

### Toast (with UNDO)
```
┌──────────────────────────────────┐
│ COMPLETED                   UNDO │
└──────────────────────────────────┘
```
- **Look:** `surfaceRaised`, hairline border, radius 2, 16 pt from the screen edges, just above the bottom bar.
- **Text:** the message in `meta` `textBright`, UPPERCASE and past tense ("DELETED", "ADDED 3 TASKS"). **UNDO** is in `accent`.
- **Timing:** slides up 16 pt with a fade over 200 ms, holds for 5 s, and is a polite live region for screen readers.

### Empty state
```
> NO ACTIVE QUESTS. TYPE BELOW TO BEGIN█

[ LOAD EXAMPLE TASKS ]
```
- A terminal line in `body` `textDim` with a blinking cursor, plus one bordered bracket button.
- **Search and filtered views get their own wording** ("> NO MATCHES."). Never show the first-run empty state there.

### Settings rows
- **Toggle:** label (`body` `text`) with a hint below (`meta` `textDim`) on the left, `[ON ]` in `accent` or `[OFF]` in `textDim` on the right. The whole row is the switch.
- **Choice:** the same, with the current value in UPPERCASE `accent`. It opens a sheet.
- **Action:** glyph column plus label.
- **Section titles:** `group` in `textBright`, separated by hairlines.

### Full-screen pages (settings, help, what's new)
- **Header:** `> page name` in `display` `accent`, plus a 44 pt bordered `✕` close button at the top right, with a hairline below.
- **Help sections:** collapsible (caret plus `group` title, 52 pt rows). Each opens with one plain sentence saying what the feature is for, then "do this → this happens" lines: the key in `accent`, the explanation in `text`.

### Boot screen (optional flourish)
```
> quest_log v1.0.0
> MOUNTING /quests ......... OK
> 12 ACTIVE · 1 OVERDUE
> READY█
                tap to skip
```
- Lines type at 8 ms per character (about 1 s total), hold for 350 ms, then fade in 160 ms.
- It runs **in parallel with the app loading** (it never delays use), only on a cold start. A tap skips it. It's skipped entirely with Reduce Motion, and the user can turn it off.

### Crash screen
- `> SOMETHING WENT WRONG`, plus reassurance that the data is safe, plus `[ TRY AGAIN ]` and `[ COPY ERROR DETAILS ]`.
- It must not depend on any app provider, since it may render when those are what failed.

---

## 7. Motion

### Tokens

| Token | Value | Use |
|---|---|---|
| `fast` | 120 ms | Small state changes: caret rotation, focus glow, lift |
| `base` | 200 ms | Default: strikethrough, toast, sheets |
| `slow` | 320 ms | Larger transitions, pulse decay |
| easing | `Easing.out(Easing.cubic)` | The only curve |
| cursor blink | 530 ms on / 530 ms off | All `█` cursors share one animated value (they blink in step, at the cost of one animation) |

### Choreography

| Moment | Spec |
|---|---|
| Complete an item | Strikethrough draws across each line (200 ms) as the color fades to `textDim`. A top-level item holds 500 ms, fades (200 ms), then moves to COMPLETED, and the tab count pulses |
| Repeating item | Strike (200), hold (300), un-strike with the new date |
| Collapse / expand | ▸ rotates 90° over 120 ms. It's instant for groups of more than 50 children, and when a recycled list cell starts showing a different item |
| Focus | The glow fades in over 120 ms |
| Drag | Lift: scale 1.02, `surfaceRaised`, outer glow, haptic. Hovering a collapsed parent for 600 ms expands it |
| Sheets | Backdrop fade plus a 72 pt rise and fade, 200 ms |
| Toast | 16 pt rise plus fade, 200 ms, hold 5 s |
| Highlight on open | The background flashes to `surfaceRaised` twice over 800 ms (from a notification or link) |

### Rules
- **Animate on the UI thread** (Reanimated worklets, or CSS transforms and opacity on the web). Never animate through React state.
- **Reduce Motion is global:** with the OS setting or the app setting on, every animation jumps to its end state (Reanimated's `ReducedMotionConfig`). Multi-step effects check it themselves: the boot screen is skipped, and the cursor stays solid.
- **Inside modals, prefer plain value animations** (opacity and translate on a shared value) over layout or "entering" animations, which are less reliable there.

---

## 8. Interaction and UX patterns

These are the rules that make the app feel good. Most were refined through device testing.

1. **Undo instead of confirm.** Every destructive or bulk action applies at once, with a 5 s `UNDO` toast. Each user action is **one** undo step, including multi-part ones (a cascade complete, an import, a paste). Ask for confirmation only when there's no undo (emptying Trash).
2. **Editing ≠ creating.** Enter or Done on an existing item **saves and closes**. It never silently starts a new item. Backspace on an empty item deletes it and stops editing. *(User feedback: linking edit and create felt broken.)*
3. **Quick-add closes the keyboard after each item.** Typing several items in a row is easier through paste, which makes one item per line, nested by indent.
4. **Keep what's being typed visible.** On focus, on each new line, and once the keyboard has settled, measure the input against the top of the toolbar and snap the list, without animation, so the input sits just above it. Re-check once layout settles (~300 ms). *(Critical in user testing.)*
5. **Bottom-anchored controls:** the quick-add bar, the editing toolbar, the selection bar, sheets and toasts all live at the bottom.
6. **Gestures with an alternative:**
   - tap to edit
   - swipe right to complete, swipe left to delete
   - hold still to drag, or hold for the menu
   - drag sideways to change nesting
   Every one also has a visible button or menu entry **and** a screen-reader action.
7. **The back button steps out of the innermost mode first:** selection, then search, then zoom (one level at a time), then leaves the app.
8. **Shorthand while typing:** `!!!` priority, `@fri 9am` due date, `*weekly` repeat, `// note`, `#Group`. Live chips preview what will be applied. Words already saved stay literal when you edit later.
9. **Progressive disclosure:**
   - **First-run tips** are one-line toasts, each shown **once**, in order, only when relevant (for example the Enter tip only while editing). A tip never replaces an UNDO toast.
   - **Example data** sits behind one button on the empty state (and is undoable).
   - **What's new** appears once after an update, generated from the changelog.
10. **Fresh install = ready to type:** focus the main input on first launch.
11. **Settings save instantly.** There's no Save button. Values are shown in place (`[ON ]`, `09:00`, `30 DAYS`), and choices open a sheet.
12. **Data safety is visible:**
    - **Trash** keeps items for 7 days.
    - The app keeps **daily snapshots** (last 3).
    - **Backups** are files the user owns.
    - Imports are **previewed** (counts, date) before merge or replace.
    - Errors are explained in plain words, and nothing changes.
13. **Haptics:**
    - light: check
    - selection tick: swipe threshold, drag events
    - success: completing a top-level item
    - medium: delete
    All of them can be turned off.

---

## 9. Accessibility

- **Contrast:** every text token is AA or better on every surface (§2), enforced by a test.
- **Targets:** 44 × 44 minimum, 52 pt rows.
- **Text size:** follows the OS, up to 1.6×. Layouts are checked at that size: titles truncate, buttons stay.
- **Screen readers:**
  - **Rows** are one element each, with a full spoken summary and custom actions: complete, edit, add subtask, indent, outdent, move up, move down, move to, priority, due date, notes, collapse, menu, delete.
  - **Checkboxes** use `role=checkbox` with a checked state, and **tabs** use `role=tab` with a selected state.
  - **Toggles** use `role=switch`, and **headers** use `role=header`.
  - **Decorative glyphs** (cursor, glow, guides) are hidden from screen readers.
  - **Toasts** are polite live regions.
- **Motion:** Reduce Motion is honoured everywhere (§7).
- **Never rely on color alone.** States also change text, glyph or weight (`[x]`, strikethrough, `OVERDUE`, `!!!`).

---

## 10. Voice and copy

- **Status and system messages** are UPPERCASE, short and past tense, like terminal output: `COMPLETED`, `DELETED`, `EXAMPLE TASKS ADDED`, `NOTHING NEW TO ADD`, `RESTORED 2026-10-07`.
- **Terminal framing:**
  - `>` prefixes titles and prompts (`> settings`, `> NO MATCHES.`)
  - `█` marks "type here"
  - bracketed `[ BUTTONS ]`
  - `·` joins status items
- **Explanations** (help, hints, errors) are **plain sentence case, friendly and concrete**: say what it is for, then "do this → this happens". No jargon, and no blame.
- **Errors** say what happened and what's still safe: "Your tasks are safe: they're saved separately from the screen."
- **Names** are lowercase where they're identity (`quest_log`, `> settings`) and UPPERCASE where they're structure (tab labels, section headings).

---

## 11. Platform notes

- **Android:**
  - Draw edge-to-edge on black with light status-bar icons and a black splash, so there's no white flash anywhere.
  - Embed fonts at build time, so they're ready on the first frame.
- **iPhone web app (PWA):**
  - **Home-screen tags:** `viewport-fit=cover` with safe-area insets, `apple-mobile-web-app-capable`, a black status bar, and an `apple-touch-icon`.
  - **App-like touch CSS** on `body`: `overscroll-behavior: none` (no bounce or pull-to-refresh), `-webkit-touch-callout: none` and `user-select: none` (long-press is a gesture, not text selection; re-enable selection for inputs), and `-webkit-tap-highlight-color: transparent`.
  - **No browser focus ring** on inputs, because the app draws its own focus.
  - **The keyboard covers the page instead of resizing it.** Measure it with `window.visualViewport` (`innerHeight − (vv.height + vv.offsetTop)`) and lift the bottom bars by that much.
  - **Multiline inputs insert a line break on Enter.** Treat "same text plus one line break" as Enter.
  - **Date and time** use the native `<input type="datetime-local">` picker (the iOS wheel). If a modal is open, attach the input inside it, because modals trap focus.
  - **A service worker** precaches the build, so the app opens offline.
- **Large screens:** cap content at 640 pt wide and centre it.

---

## 12. Drop-in tokens

### TypeScript / React Native
```ts
export const colors = {
  bg: '#000000', surface: '#060D08', surfaceRaised: '#0B160D', line: '#12301A',
  textDim: '#2B903F', text: '#2FB344', accent: '#39FF14', textBright: '#B6FFB0',
} as const;

export const fonts = { regular: 'JetBrainsMono-Regular', medium: 'JetBrainsMono-Medium', bold: 'JetBrainsMono-Bold' } as const;
export const maxFontSizeMultiplier = 1.6;

export const type = {
  display:    { fontFamily: fonts.bold,    fontSize: 22, lineHeight: 30 },
  tab:        { fontFamily: fonts.bold,    fontSize: 14, lineHeight: 20, letterSpacing: 1, textTransform: 'uppercase' },
  group:      { fontFamily: fonts.bold,    fontSize: 14, lineHeight: 20, textTransform: 'uppercase' },
  body:       { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24 },
  subtask:    { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  meta:       { fontFamily: fonts.medium,  fontSize: 13, lineHeight: 18 },
  notes:      { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  glyph:      { fontFamily: fonts.regular, fontSize: 20, lineHeight: 24 },
  caretGlyph: { fontFamily: fonts.regular, fontSize: 31, lineHeight: 31 },
  metaGlyph:  { fontFamily: fonts.medium,  fontSize: 16, lineHeight: 18 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const size = {
  indent: 24, caretColumn: 36, caretGap: 8, maxVisualDepth: 4,
  rowMinHeight: 52, hitTarget: 44, toolbarHeight: 56, maxContentWidth: 640,
} as const;
export const shape = { radius: 2, hairline: 1, strike: 1.5, checkboxTracking: -4, dropIndicator: 2 } as const;

export const duration = { fast: 120, base: 200, slow: 320 } as const;
export const timing = { cursorBlink: 530, completeHold: 500, repeatHold: 300, bootFade: 160, toastHold: 5000, highlight: 800, longPress: 300, hoverExpand: 600 } as const;
// easing: Easing.out(Easing.cubic)

export const glowShadow = {
  inset: 'inset 0 0 6px 0 rgba(57, 255, 20, 0.35)',
  outset: '0 0 6px 0 rgba(57, 255, 20, 0.35)',
} as const;
export const backdrop = 'rgba(0,0,0,0.6)';
```

### CSS custom properties (web)
```css
:root {
  /* color */
  --bg: #000000; --surface: #060D08; --surface-raised: #0B160D; --line: #12301A;
  --text-dim: #2B903F; --text: #2FB344; --accent: #39FF14; --text-bright: #B6FFB0;
  --backdrop: rgba(0, 0, 0, 0.6);
  --glow-inset: inset 0 0 6px 0 rgba(57, 255, 20, 0.35);
  --glow: 0 0 6px 0 rgba(57, 255, 20, 0.35);

  /* type */
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --fs-display: 22px; --lh-display: 30px;
  --fs-body: 17px;    --lh-body: 24px;
  --fs-subtask: 15px; --lh-subtask: 22px;
  --fs-heading: 14px; --lh-heading: 20px;   /* tab / group: bold, uppercase */
  --fs-meta: 13px;    --lh-meta: 18px;
  --fs-glyph: 20px;

  /* space and size */
  --space-xs: 4px; --space-sm: 8px; --space-md: 12px; --space-lg: 16px; --space-xl: 24px;
  --hit: 44px; --row: 52px; --indent: 24px; --toolbar: 56px; --content-max: 640px;

  /* shape */
  --radius: 2px; --hairline: 1px;

  /* motion */
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 320ms;
  --ease: cubic-bezier(0.33, 1, 0.68, 1);  /* ≈ ease-out cubic */
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

/* the blinking block cursor: one shared animation */
.cursor::after { content: '█'; color: var(--accent); animation: blink 1060ms steps(1) infinite; }
@keyframes blink { 50% { color: transparent; } }
```

---

## 13. Checklist for a new screen

- [ ] Only tokens: no hex values, raw font sizes or one-off spacing.
- [ ] The title is `> name` (display, accent). There's a close or back control at the top right, 44 pt.
- [ ] Primary actions are at the bottom, within thumb reach.
- [ ] Every tappable thing is at least 44 × 44, and rows are at least 52.
- [ ] Destructive actions undo through a toast; no confirmation dialog unless there's no undo.
- [ ] Text inputs stay visible above the keyboard and toolbars.
- [ ] Empty, search-empty and error states each have their own terminal-style line.
- [ ] Screen-reader labels and roles are set, and every gesture has an action alternative.
- [ ] It works at 1.6× text size and with Reduce Motion on.
- [ ] Status copy is UPPERCASE and terse; help copy is plain and friendly.
