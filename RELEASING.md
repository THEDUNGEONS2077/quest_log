# Releasing quest_log

This covers how release builds are signed, built, and published. The full release script, `scripts/release-android.sh`, arrives in Phase 14. Until then, use the manual steps below.

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

## Manual release build (until Phase 14)
```bash
npm run check
APP_VARIANT=release npx expo prebuild --clean --platform android
(cd android && ./gradlew assembleRelease)
APK=android/app/build/outputs/apk/release/app-release.apk
apksigner verify --print-certs "$APK"              # signed with the release key
aapt2 dump permissions "$APK" | grep -c INTERNET   # must print 0
ls -lh "$APK"                                       # must be < 25 MB
adb install -r "$APK"                               # -r keeps data, like a friend's update
```

## Versioning
- `version.json` is the single source of truth. `versionCode` **must increase** for every build that friends install.
- Add a matching section to `CHANGELOG.md` for every version.
