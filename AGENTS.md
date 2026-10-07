This is an Expo/React Native mobile app (Expo SDK 57). **Read `CLAUDE.md`, `PLAN.md`, and `ARCHITECTURE.md` first.** They override generic Expo advice.

## Expo has changed: don't trust your training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo or React Native API:

1. Read the major version of `expo` in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/` (append `.md` for markdown).
3. For anything else, use https://docs.expo.dev/llms.txt.

## Commands

```bash
npx expo install <package>  # ALWAYS use instead of npm add; resolves SDK-compatible versions
npm run check               # typecheck + lint + tests; run before declaring a task done
npx expo-doctor             # diagnose dependency and config issues
```

## Project-specific rules

- **No EAS / Expo cloud services.** Builds are local (`npx expo run:android`, Gradle). There are no OTA updates.
- **Expo Router** routes live in `app/` at the repo root. Non-route code lives outside `app/`.
- **`android/` and `ios/` are generated** by `expo prebuild` (CNG). Never edit them; configure native behavior in `app.config.ts` and `/plugins`.
- **Expo Go won't work.** This project uses a development build (`expo-dev-client`).
