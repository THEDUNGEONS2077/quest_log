# iOS Port Checklist

This is a running list of everything that behaves differently on iOS or still needs iOS work (PLAN §15.7). Add a line here **as soon as** you build something with an iOS difference. Work through the list in Phase 15.

## Build machine and distribution
- [ ] iOS apps can only be built with **Xcode on macOS**. Arrange a Mac (your own or borrowed), a rented remote Mac, or a macOS CI runner before Phase 15.
- [ ] Choose a distribution method (PLAN §15.8): Ad Hoc via GitHub, TestFlight, or free sideload.
- [ ] Write the iOS release script that attaches the `.ipa` (plus the manifest, for Ad Hoc) to the same GitHub Release as the APK.

## Notifications
- [ ] iOS allows **64 pending notifications** per app. Schedule the nearest 60 and top up during reconciliation.
- [ ] Pre-schedule the **next 3 occurrences** of repeating tasks, since there's no headless task to reschedule on completion. Use `nextOccurrence` (lib/recurrence.ts) to compute them in `desiredReminders`, and give each the `task:<id>:<dueAt>` identifier.
- [ ] Notification actions (DONE / SNOOZE): the app drains `ops.pending` on launch and foreground.
- [ ] Request notification permission, considering provisional authorization.

## Permissions and Info.plist
- [ ] Write the Info.plist usage strings for every permission used.

## Widget
Removed from the project (user decision, 2026-10-08): there is no home screen widget on either platform, so there's no WidgetKit or App Group work.

## Keyboard and gestures
- [ ] Check the accessory bar with the iOS keyboard and the predictive text bar.
- [ ] `EditToolbar` ends editing on `keyboardDidHide`. On iOS that event also fires for keyboard type switches and the floating keyboard on iPad; confirm editing doesn't end unexpectedly.
- [ ] `EditToolbar` buttons use `focusable={false}` (Android-only) to keep the editor focused. Confirm tapping them doesn't blur the input on iOS.
- [ ] `InlineEditor` uses `submitBehavior="blurAndSubmit"` with `multiline`. Confirm iOS shows "Done" and doesn't insert newlines.
- [ ] The edge-swipe back gesture must not conflict with row swipes (`SwipeableRow`: activeOffsetX ±16, failOffsetY ±12). Add a left-edge exclusion zone.
- [ ] Long-press must not trigger the text-selection magnifier on non-editing rows (the drag gesture in `components/list/drag.tsx` activates after 300 ms).
- [ ] Drag-and-drop: confirm that the active Pan stops the native ScrollView from scrolling on iOS (FlashList `scrollEnabled` is also turned off while dragging), and check the lifted row's shadow (`focusGlow`) on iOS.

## Fonts, glyphs, haptics
- [ ] Check glyph rendering in JetBrains Mono. Phase 1 found these glyphs missing from the font: ⏰ ↻ ⌕ ⚙ ↶ ⇤ ⤢ ☐ ⧉ ⎘ ↳ (see `theme/glyphs.ts`).
  - [ ] `repeat` (↻) still renders through the system fallback font. Check how it looks in iOS's fallback font.
- [ ] `theme/platform.ts`: `includeFontPadding` is Android-only. Check vertical text alignment on iOS.
- [ ] Map haptics to the iOS feedback generators. `services/haptics.ts` uses expo-haptics impact, selection and notification, which map directly, but feel them on a device.

## Layout
- [ ] Safe areas: the home indicator and the Dynamic Island.

## Phase 6 additions
- [ ] "Copy as text" uses expo-clipboard. Check the iOS paste-permission banner when the outline is pasted into another app.
- [ ] Links in notes use `Linking.openURL`. Confirm http(s) links open in Safari.
- [ ] `NotesEditor` is a multiline TextInput with `submitBehavior="newline"`. Check that the editor grows to 8 lines and then scrolls, with the iOS keyboard open.

## Phase 7 additions
- [ ] iOS has no headless notification task: DONE/SNOOZE responses go into `ops.pending` from the response listener, and the queue is drained on launch and foreground (already wired in `services/reminderLifecycle.ts`). Check this when the app is fully closed.
- [ ] Cap scheduled reminders at 60 (`desiredReminders(state, now, 60)` on iOS) and top up on each reconcile.
- [ ] `DueSheet` uses an inline `DateTimePicker` on iOS (mode "datetime"). Style it as a proper sheet.
- [ ] Notification small icon and color are Android-only. Check the iOS notification appearance.
- [ ] Request permission with provisional authorization in mind.

## Typed text always visible
- [ ] `keepInView.tsx` uses `TextInput.State.currentlyFocusedInput()` and `measureInWindow` on the input and the editing toolbar (inside KeyboardStickyView). Confirm on iOS that measurements include the sticky view's transform, so the "floor" is the toolbar's visible top.

## Offline guarantee
- [ ] iOS has no INTERNET permission to remove, so the guarantee comes from the code itself. Run a dependency audit to confirm there are no network libraries.
