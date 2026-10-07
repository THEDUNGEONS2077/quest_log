# iOS Port Checklist

This is a running list of everything that behaves differently on iOS or still needs iOS work (PLAN §15.7). Add a line here **as soon as** you build something with an iOS difference. Work through the list in Phase 15.

## Build machine and distribution
- [ ] iOS apps can only be built with **Xcode on macOS**. Arrange a Mac (your own or borrowed), a rented remote Mac, or a macOS CI runner before Phase 15.
- [ ] Choose a distribution method (PLAN §15.8): Ad Hoc via GitHub, TestFlight, or free sideload.
- [ ] Write the iOS release script that attaches the `.ipa` (plus the manifest, for Ad Hoc) to the same GitHub Release as the APK.

## Notifications
- [ ] iOS allows **64 pending notifications** per app. Schedule the nearest 60 and top up during reconciliation.
- [ ] Pre-schedule the **next 3 occurrences** of repeating tasks, since there's no headless task to reschedule on completion.
- [ ] Notification actions (DONE / SNOOZE): the app drains `ops.pending` on launch and foreground.
- [ ] Request notification permission, considering provisional authorization.

## Permissions and Info.plist
- [ ] Write the Info.plist usage strings for every permission used.

## Widget
- [ ] WidgetKit extension in SwiftUI, via `@bacons/apple-targets`.
- [ ] An App Group container for shared data (MMKV in the group path, or a JSON file).
- [ ] Interactive checkboxes through **App Intents** (iOS 17+).
- [ ] A small native module to trigger widget reloads from JS.

## Keyboard and gestures
- [ ] Check the accessory bar with the iOS keyboard and the predictive text bar.
- [ ] `EditToolbar` ends editing on `keyboardDidHide`. On iOS that event also fires for keyboard type switches and the floating keyboard on iPad; confirm editing doesn't end unexpectedly.
- [ ] `EditToolbar` buttons use `focusable={false}` (Android-only) to keep the editor focused. Confirm tapping them doesn't blur the input on iOS.
- [ ] `InlineEditor` uses `submitBehavior="blurAndSubmit"` with `multiline`. Confirm iOS shows "Done" and doesn't insert newlines.
- [ ] The edge-swipe back gesture must not conflict with row swipes (`SwipeableRow`: activeOffsetX ±16, failOffsetY ±12). Add a left-edge exclusion zone.
- [ ] Long-press must not trigger the text-selection magnifier on non-editing rows.

## Fonts, glyphs, haptics
- [ ] Check glyph rendering in JetBrains Mono. Phase 1 found these glyphs missing from the font: ⏰ ↻ ⌕ ⚙ ↶ ⇤ ⤢ ☐ ⧉ ⎘ ↳ (see `theme/glyphs.ts`).
  - [ ] `repeat` (↻) still renders through the system fallback font. Check how it looks in iOS's fallback font.
- [ ] `theme/platform.ts`: `includeFontPadding` is Android-only. Check vertical text alignment on iOS.
- [ ] Map haptics to the iOS feedback generators. `services/haptics.ts` uses expo-haptics impact, selection and notification, which map directly, but feel them on a device.

## Layout
- [ ] Safe areas: the home indicator and the Dynamic Island.

## Offline guarantee
- [ ] iOS has no INTERNET permission to remove, so the guarantee comes from the code itself. Run a dependency audit to confirm there are no network libraries.
