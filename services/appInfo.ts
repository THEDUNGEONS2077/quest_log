/**
 * services/appInfo.ts: the running app's version and build number.
 *
 * Layer: services. Read from the app config (app.config.ts puts
 * version.json into `extra`), so there's one source of truth for the boot
 * screen, help, the dev screen and "What's new".
 */
import Constants from 'expo-constants';

/** "0.10.0". */
export function appVersion(): string {
  return String(Constants.expoConfig?.extra?.versionName ?? '');
}

/** The Android versionCode, e.g. 16 (0 if unknown). */
export function appBuild(): number {
  return Number(Constants.expoConfig?.extra?.versionCode ?? 0);
}
