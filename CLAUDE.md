# quest_log: notes for Claude Code

Read these first:
- **`PLAN.md`** is the product spec and build phases. Work phase by phase (§16) and commit at the end of each phase.
- **`ARCHITECTURE.md`** covers layers, import rules, data flows, and the feature checklist.

## Rules
- **Comments are required.** Every file gets a header comment (purpose and layer). Every exported function, component, hook, store action, and config plugin gets a doc comment covering what it does, its inputs and outputs, and its side effects. Non-obvious logic and each shell-script step get a short comment explaining *why*. Explain intent, not syntax.
- **TypeScript** is `strict` with no `any`. At a library boundary, use an eslint-disable comment with a reason.
- **No network code, no analytics, no Expo cloud services** (EAS Build, EAS Update). Everything builds locally. This overrides AGENTS.md's EAS guidance.
- **`android/` and `ios/` are generated.** Never edit them; use config plugins in `/plugins`.
- **New dependencies** need a one-line justification in the commit message. Install with `npx expo install`.
- **Beta data is real.** Every schema change needs a migration plus a fixture test.
- **Expo APIs change every SDK.** Check the versioned docs (`https://docs.expo.dev/versions/v57.0.0/…`, append `.md`) instead of relying on memory.

## Commands
```bash
npm run check            # typecheck + lint + jest (must pass before every commit)
npm start                # Metro for the dev build (APP_VARIANT=dev)
npm run android:dev      # build + install quest_log DEV on the USB-attached phone
npm run android:release  # clean prebuild + signed release APK
adb reverse tcp:8081 tcp:8081   # Metro over USB (re-run after replugging)
```

## Environment
- WSL Ubuntu 24.04 with Node (nvm) and JDK 17. The Android SDK is in `~/Android/Sdk` and managed by the `android sdk` CLI with `--no-metrics`.
- The phone is attached over USB with `usbipd attach --wsl --busid <id> --auto-attach` (run in Windows).
