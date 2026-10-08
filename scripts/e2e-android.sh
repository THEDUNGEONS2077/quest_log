#!/usr/bin/env bash
# scripts/e2e-android.sh: runs the Maestro suite (e2e/android) on a
# connected Android phone, or on a local emulator (PLAN Phase 14).
#
# Usage:
#   scripts/e2e-android.sh              # build the test app, install it on the connected phone, run every flow
#   scripts/e2e-android.sh --no-build   # reuse the last test build
#   scripts/e2e-android.sh --emulator   # boot the questlog_e2e emulator instead (needs KVM access)
#
# SAFETY: the flows clear app data on purpose. They run against a separate
# app, "quest_log E2E" (package com.thedungeons2077.questlog.e2e, built with
# QUESTLOG_E2E=1). The real quest_log and its tasks are never installed,
# uninstalled or touched by this script.
#
# The first install over USB may show a Play Protect prompt on the phone:
# tap "Install anyway" (or "Don't send"), or the install waits.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=true; EMULATOR=false
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=false ;;
    --emulator) EMULATOR=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$SDK/platform-tools/adb"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
APK=android/app/build/outputs/apk/release/app-release.apk
E2E_PACKAGE=com.thedungeons2077.questlog.e2e

# 1. Build the test app (release config, separate package). An emulator needs x86_64.
if $BUILD; then
  if $EMULATOR; then QUESTLOG_ABIS=x86_64 npm run android:e2e; else npm run android:e2e; fi
fi
[ -f "$APK" ] || { echo "no APK at $APK; run without --no-build" >&2; exit 1; }
# Never install anything but the test app (a stale real build could be lying there).
"$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)/aapt2" dump packagename "$APK" | grep -qx "$E2E_PACKAGE" ||
  { echo "the APK isn't the E2E test app; rebuild without --no-build" >&2; exit 1; }

# 2. Device: boot the emulator if asked, else expect exactly one connected device.
if $EMULATOR && ! "$ADB" devices | grep -q '^emulator-'; then
  LIBS="$HOME/.local/emu-libs/root/usr/lib/x86_64-linux-gnu"
  LD_LIBRARY_PATH="$LIBS:$LIBS/pulseaudio:${LD_LIBRARY_PATH:-}" \
    "$SDK/emulator/emulator" -avd questlog_e2e -no-window -no-audio -no-boot-anim -no-snapshot \
    -gpu swiftshader_indirect >/tmp/quest_log-emulator.log 2>&1 &
  "$ADB" wait-for-device
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
fi
[ "$("$ADB" devices | grep -c 'device$')" = "1" ] || { echo "connect exactly one device (adb devices)" >&2; exit 1; }

# 3. (Re)install the test app only.
"$ADB" install --user 0 -r "$APK"

# 4. Run every flow; Maestro reports each one.
"$MAESTRO" test e2e/android
