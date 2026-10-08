#!/usr/bin/env bash
# scripts/release-android.sh: builds, verifies and publishes an Android
# release (PLAN §15.4, Phase 14).
#
# Usage:
#   scripts/release-android.sh            # build + verify + DRAFT release (review it on GitHub, then publish)
#   scripts/release-android.sh --publish  # same, but published straight away
#   scripts/release-android.sh --prerelease --publish
#   scripts/release-android.sh --verify-only   # build + verify, nothing published
#
# Every check must pass, or the script stops before anything is published.
# The version comes from version.json; its CHANGELOG.md section becomes the
# release notes (and the in-app "What's new").
set -euo pipefail

# --- Options ---------------------------------------------------------------
PUBLISH=false; PRERELEASE=false; VERIFY_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --publish) PUBLISH=true ;;
    --prerelease) PRERELEASE=true ;;
    --verify-only) VERIFY_ONLY=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Run from the repo root, wherever the script is called from.
cd "$(dirname "$0")/.."

# Fail with a message (every check below uses this).
fail() { echo "✕ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

# --- Expected values (change only on purpose) -----------------------------
# The release key's certificate fingerprint, as published in INSTALL.md.
CERT_SHA256='72:C3:63:F2:DF:3A:1D:77:F5:BC:71:63:C9:BB:AC:7D:80:8B:8C:C3:72:91:45:D2:3E:2A:8D:D9:D6:7E:0F:97'
# The exact permission set a release may have (no INTERNET, no storage).
ALLOWED_PERMISSIONS='android.permission.POST_NOTIFICATIONS
android.permission.RECEIVE_BOOT_COMPLETED
android.permission.SCHEDULE_EXACT_ALARM
android.permission.USE_EXACT_ALARM
android.permission.VIBRATE
android.permission.WAKE_LOCK
com.thedungeons2077.questlog.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
# Size budgets (PLAN §5, PERF.md): APK < 25 MB, Hermes bundle < 4.0 MB.
MAX_APK_BYTES=$((25 * 1000 * 1000))
MAX_BUNDLE_BYTES=$((4 * 1024 * 1024))

# --- Tools -------------------------------------------------------------------
BT="$(ls -d "${ANDROID_HOME:-$HOME/Android/Sdk}"/build-tools/* | sort -V | tail -1)"
APKSIGNER="$BT/apksigner"; AAPT2="$BT/aapt2"
[ -x "$APKSIGNER" ] && [ -x "$AAPT2" ] || fail "Android build-tools not found (apksigner, aapt2)"
command -v gh >/dev/null || fail "GitHub CLI (gh) not installed"

# --- Version and notes ----------------------------------------------------
VERSION="$(node -p "require('./version.json').versionName")"
BUILD="$(node -p "require('./version.json').versionCode")"
TAG="v$VERSION"
# The CHANGELOG section for this version, without its heading.
NOTES="$(awk -v h="## $VERSION (build $BUILD)" '$0==h{f=1;next} /^## /{if(f)exit} f' CHANGELOG.md)"
[ -n "$NOTES" ] || fail "CHANGELOG.md has no section '## $VERSION (build $BUILD)'"
ok "version $VERSION (build $BUILD), notes found"

# --- Preconditions (skipped for --verify-only) ----------------------------
if ! $VERIFY_ONLY; then
  # Publish only committed, pushed code, so the tag matches the APK.
  [ -z "$(git status --porcelain)" ] || fail "uncommitted changes; commit first"
  git fetch -q origin
  [ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}')" ] || fail "HEAD isn't pushed to origin"
  ! gh release view "$TAG" >/dev/null 2>&1 || fail "release $TAG already exists (bump version.json)"
  # versionCode must grow, or phones refuse the update.
  LAST_BUILD="$(git tag --list 'v*' | while read -r t; do git show "$t:version.json" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).versionCode)}catch{}})"; done | sort -n | tail -1)"
  [ -z "$LAST_BUILD" ] || [ "$BUILD" -gt "$LAST_BUILD" ] || fail "versionCode $BUILD isn't above the last released build $LAST_BUILD"
  ok "clean, pushed, new tag, build number increases"
fi

# --- Tests, then the signed build ----------------------------------------------
npm run check >/dev/null || fail "npm run check failed (run it to see why)"
ok "typecheck, lint and tests pass"
npm run android:release >/tmp/quest_log-release-build.log 2>&1 || fail "release build failed (see /tmp/quest_log-release-build.log)"
APK=android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || fail "no APK at $APK"
ok "signed release built"

# --- Verify the APK -----------------------------------------------------------
# 1. Signed with the release key (same key, or friends can't update).
"$APKSIGNER" verify "$APK" || fail "signature does not verify"
SIG="$("$APKSIGNER" verify --print-certs "$APK" | sed -n 's/.*certificate SHA-256 digest: //p' | head -1 | tr 'a-f' 'A-F' | sed 's/../&:/g; s/:$//')"
[ "$SIG" = "$CERT_SHA256" ] || fail "signed with an unexpected key: $SIG"
ok "signed with the release key"

# 2. Exactly the allowed permissions (no INTERNET, no storage, nothing new).
PERMS="$("$AAPT2" dump permissions "$APK" | sed -n "s/^uses-permission: name='\(.*\)'.*/\1/p" | sort)"
[ "$PERMS" = "$(echo "$ALLOWED_PERMISSIONS" | sort)" ] || { echo "$PERMS" >&2; fail "permissions differ from the allow-list"; }
ok "permissions match the allow-list ($(echo "$PERMS" | wc -l))"

# 3. arm64 only, and within the size budgets.
ABIS="$(unzip -l "$APK" | sed -n 's#.* lib/\([^/]*\)/.*#\1#p' | sort -u | tr '\n' ' ')"
[ "$ABIS" = "arm64-v8a " ] || fail "unexpected native ABIs: $ABIS"
APK_BYTES="$(stat -c %s "$APK")"
[ "$APK_BYTES" -lt "$MAX_APK_BYTES" ] || fail "APK is $APK_BYTES bytes (budget $MAX_APK_BYTES)"
BUNDLE_BYTES="$(unzip -l "$APK" assets/index.android.bundle | awk '/index.android.bundle/{print $1}')"
[ "$BUNDLE_BYTES" -lt "$MAX_BUNDLE_BYTES" ] || fail "JS bundle is $BUNDLE_BYTES bytes (budget $MAX_BUNDLE_BYTES)"
ok "arm64 only; APK $APK_BYTES bytes, bundle $BUNDLE_BYTES bytes"

# --- Package -------------------------------------------------------------------
mkdir -p dist
OUT="dist/quest_log-$TAG.apk"
cp "$APK" "$OUT"
(cd dist && sha256sum "quest_log-$TAG.apk" > "quest_log-$TAG.apk.sha256")
ok "packaged $OUT (+ .sha256)"
$VERIFY_ONLY && { echo "verify-only: nothing published"; exit 0; }

# --- Publish -------------------------------------------------------------------
FLAGS=()
$PUBLISH || FLAGS+=(--draft)
$PRERELEASE && FLAGS+=(--prerelease)
gh release create "$TAG" "$OUT" "$OUT.sha256" --title "$TAG (build $BUILD)" --notes "$NOTES" "${FLAGS[@]}"
$PUBLISH && ok "published $TAG" || ok "draft $TAG created: review it on GitHub, then publish"
