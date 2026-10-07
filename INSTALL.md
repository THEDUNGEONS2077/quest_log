# Installing quest_log (Android)

quest_log isn't on the Play Store. You install it from a file (an "APK") that I publish on GitHub.

## First install
1. Open the APK link I sent you **on your phone** and download the file.
2. Tap the downloaded file. If Android asks, allow your browser to **install unknown apps**. You only have to do this once.
3. If Play Protect warns about an unrecognized app, tap **More details → Install anyway**. This happens because the app isn't from the Play Store.
4. Open **quest_log**.

## Updating
- Open the new link and install the new APK **over** the old one. Your tasks and settings are kept.
- **Never uninstall first.** Uninstalling deletes all of your tasks. If in doubt, use Settings → Export first.
- The app never checks for updates. I'll tell you when there's a new version.

## Is this APK really from me?
Every release is signed with the same key. Its SHA-256 certificate fingerprint is:

```
72:C3:63:F2:DF:3A:1D:77:F5:BC:71:63:C9:BB:AC:7D:80:8B:8C:C3:72:91:45:D2:3E:2A:8D:D9:D6:7E:0F:97
```

To check an APK on a computer, run `apksigner verify --print-certs quest_log-vX.Y.Z.apk`. Each release also comes with a `.sha256` file that you can compare against the downloaded APK.

## Requirements
Android 7.0 or newer, on a 64-bit (arm64) phone, which covers essentially every phone from the last several years.
