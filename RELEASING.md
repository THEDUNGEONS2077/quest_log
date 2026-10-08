# Releasing quest_log

This covers how release builds are signed, built, tested and published.

## Signing key (critical)

Android only installs an update over an existing app if **both are signed with the same key**. If the key is lost, friends must uninstall to update, and **uninstalling deletes their tasks**.

- **Keystore:** `~/.quest_log/release.keystore` (alias `questlog`). It lives **outside the repo** and is never committed.
- **Passwords:** stored in `~/.gradle/gradle.properties`, which is never committed:
  ```properties
  QUESTLOG_STORE_FILE=/home/<user>/.quest_log/release.keystore
  QUESTLOG_STORE_PASSWORD=...
  QUESTLOG_KEY_ALIAS=questlog
  QUESTLOG_KEY_PASSWORD=...
  ```
- **Backups:** keep the keystore file **and** both passwords in two places, for example a password manager and an encrypted USB drive.
- `plugins/withReleaseSigning.js` reads these properties. If any is missing, the release build **fails** rather than producing a debug-signed APK.

### Restoring on a new computer
1. Set up the toolchain (see `CLAUDE.md` → Environment).
2. Copy the keystore back to `~/.quest_log/release.keystore`.
3. Recreate the four `QUESTLOG_*` lines in `~/.gradle/gradle.properties`.
4. Build a release and check that the fingerprint matches `INSTALL.md`:
   `apksigner verify --print-certs <apk>`.

## Releasing a version
1. Bump `version.json`: `versionName` (semver) and `versionCode` (**must increase**, or phones refuse the update).
2. Add a `## <versionName> (build <versionCode>)` section to `CHANGELOG.md`. It becomes the release notes and the in-app **What's new** (`npm run changelog` regenerates `assets/changelog.json`, and a test fails if you forget).
3. Run the end-to-end suite (below).
4. Commit and push, then run:
   ```bash
   scripts/release-android.sh             # draft release: review it on GitHub, then publish
   scripts/release-android.sh --publish   # or publish immediately
   scripts/release-android.sh --verify-only   # build + every check, publish nothing
   ```
   The script stops, and publishes nothing, unless every check passes:
   - the tree is clean and pushed, the tag is new, and `versionCode` is above every released build
   - `npm run check` passes (types, lint, unit tests, perf smoke tests)
   - the APK is signed with the release key (its fingerprint matches `INSTALL.md`)
   - the permissions exactly match the allow-list, so a library can't sneak in INTERNET or storage access
   - the APK is arm64 only, under 25 MB, with a JS bundle under 4 MB
5. Send testers the link: `https://github.com/THEDUNGEONS2077/quest_log/releases/latest`.

## End-to-end tests (Maestro)
Flows live in `e2e/android/`. They cover first run and example tasks, adding, editing, completing and undoing, subtasks and shorthand, search, settings and help.

**They run against a separate test app**, "quest_log E2E" (package `com.thedungeons2077.questlog.e2e`, built with `QUESTLOG_E2E=1`). The flows clear app data on purpose, so they never touch the real quest_log or its tasks. The script refuses to install any APK that isn't the test app.

```bash
scripts/e2e-android.sh              # build the test app, install it on the connected phone, run every flow
scripts/e2e-android.sh --no-build   # reuse the last test build
scripts/e2e-android.sh --emulator   # use the questlog_e2e emulator instead (needs KVM access)
```

- **Phone:** attach it over USB (`usbipd attach --wsl --busid <id> --auto-attach` in Windows). Installs use `--user 0`, because a plain `adb install` also targets Samsung's Secure Folder user, which adb can't access.
  - **The current test phone (Galaxy S25 Ultra) blocks USB installs.** The Play Store's verifier rejects them silently ("Install failed", with no prompt on screen). That's the real reason `adb install` seemed to hang. Allowing them would mean changing a phone security setting, so the suite isn't run on that phone. Test builds reach it through GitHub Releases instead.
- **Emulator:** needs `/dev/kvm` access. That isn't available on this machine, so the phone is the test device. The AVD `questlog_e2e` (API 36) and the emulator's audio libraries in `~/.local/emu-libs` are already set up, in case KVM access becomes available later.

## Versioning
- `version.json` is the single source of truth. `versionCode` **must increase** for every build that friends install.
- Add a matching section to `CHANGELOG.md` for every version.
