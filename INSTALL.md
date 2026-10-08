# Installing quest_log (Android)

quest_log isn't on the Play Store. You install it from a file (an "APK") that I publish on GitHub.

## First install
1. On your phone, open the [latest release](https://github.com/THEDUNGEONS2077/quest_log/releases/latest) (or the link I sent you) and download the `.apk` file.
2. Tap the downloaded file. If Android asks, allow your browser to **install unknown apps**. You only have to do this once.
3. If Play Protect warns about an unrecognized app, tap **More details → Install anyway**. This happens because the app isn't from the Play Store.
4. Open **quest_log**.

## Updating
- Open the new link and install the new APK **over** the old one. Your tasks and settings are kept.
- **Never uninstall first.** Uninstalling deletes all of your tasks. If in doubt, use **⊛ Settings → Save backup to a folder** first.
- The app never checks for updates (it has no internet access). I'll tell you when there's a new version, and **What's new** shows what changed the first time you open it.

## Backups and moving to a new phone
- **⊛ Settings → Save backup to a folder** writes every task to a file you keep (or use **Share backup…** to send it to your own cloud or email).
- On the new phone, install quest_log, then **⊛ Settings → Import a backup…** and choose **Replace**.
- The app also keeps a copy of your tasks from each of the last 3 days: **Restore a daily snapshot…**.

## Reporting a problem
**⊛ Settings → Report a problem** opens a pre-filled page on GitHub in your browser. If the app ever shows **SOMETHING WENT WRONG**, tap **COPY ERROR DETAILS** and paste them into your report. Your tasks are safe either way.

## Is this APK really from me?
Every release is signed with the same key. Its SHA-256 certificate fingerprint is:

```
72:C3:63:F2:DF:3A:1D:77:F5:BC:71:63:C9:BB:AC:7D:80:8B:8C:C3:72:91:45:D2:3E:2A:8D:D9:D6:7E:0F:97
```

To check an APK on a computer, run `apksigner verify --print-certs quest_log-vX.Y.Z.apk`. Each release also comes with a `.sha256` file that you can compare against the downloaded APK.

## Requirements
Android 7.0 or newer, on a 64-bit (arm64) phone, which covers essentially every phone from the last several years.
