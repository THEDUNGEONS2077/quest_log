/**
 * app.config.ts: Expo app configuration for both build variants (PLAN §15.2).
 *
 * APP_VARIANT selects the variant:
 *   dev     → com.thedungeons2077.questlog.dev, "quest_log DEV", DEV icon,
 *             JS from Metro, INTERNET kept (needed to reach Metro).
 *   release → com.thedungeons2077.questlog, "quest_log", bundled Hermes
 *             bytecode, INTERNET removed, R8 on, signed with the release key.
 * The two install side by side, so daily dev never touches your test install.
 *
 * android/ and ios/ are generated from this file by `expo prebuild` and are
 * never edited by hand; native changes go through /plugins.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

import version from './version.json';

/** The two supported build variants. */
type Variant = 'dev' | 'release';

/**
 * Reads APP_VARIANT. Defaults to `dev` so plain `npx expo start` never
 * produces release config by accident. Unknown values fail loudly.
 */
export function getVariant(env: Record<string, string | undefined> = process.env): Variant {
  const v = env.APP_VARIANT ?? 'dev';
  if (v !== 'dev' && v !== 'release') {
    throw new Error(`APP_VARIANT must be "dev" or "release", got "${v}"`);
  }
  return v;
}

/** Base app ID. Permanent once friends install; never change it (PLAN §18). */
const APP_ID = 'com.thedungeons2077.questlog';
const BLACK = '#000000';

/** Android permissions the app requests. VIBRATE: haptics (PLAN §9.18). */
export const ANDROID_PERMISSIONS = ['android.permission.VIBRATE'];

/**
 * Permissions removed from the final release manifest, even when a library
 * declares them. Checked by __tests__/config.test.ts and, on the built APK,
 * by `aapt2 dump permissions` (RELEASING.md).
 */
export const RELEASE_BLOCKED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

/**
 * Builds the Expo config for one variant. Exported separately from the
 * default export so __tests__/config.test.ts can check both variants.
 */
export function buildConfig(variant: Variant, base: Partial<ExpoConfig> = {}): ExpoConfig {
  const isDev = variant === 'dev';
  const appId = isDev ? `${APP_ID}.dev` : APP_ID;
  // The dev icon set has a "DEV" label under the mark.
  const icon = (name: string) => `./assets/icon/${name}${isDev ? '-dev' : ''}.png`;

  return {
    ...base,
    name: isDev ? 'quest_log DEV' : 'quest_log',
    slug: 'quest_log',
    // version.json is the single source of truth for versions (PLAN §15.4).
    version: version.versionName,
    // Deep links: questlog://task/<id>. The dev build uses a separate scheme
    // so links never open the wrong install.
    scheme: isDev ? 'questlog-dev' : 'questlog',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    backgroundColor: BLACK,
    icon: icon('icon'),

    android: {
      package: appId,
      versionCode: version.versionCode,
      adaptiveIcon: {
        foregroundImage: icon('adaptive-foreground'),
        monochromeImage: icon('monochrome'),
        backgroundColor: BLACK,
      },
      // Android back zooms out of the tree (PLAN §9.2); the predictive-back
      // animation would preview leaving the app instead.
      predictiveBackGestureEnabled: false,
      // Explicit allow-list. Without it, Expo adds a default set (storage,
      // SYSTEM_ALERT_WINDOW, …) that quest_log never uses. Later phases add
      // notification permissions here as they need them (PLAN §3).
      permissions: ANDROID_PERMISSIONS,
      // Release only: strip anything a library manifest merges back in.
      // INTERNET removal makes the app physically unable to go online
      // (PLAN §3); the dev build keeps INTERNET for Metro and the overlay
      // permission for the dev menu.
      blockedPermissions: isDev ? [] : RELEASE_BLOCKED_PERMISSIONS,
    },

    ios: {
      // Ready for the Phase 15 port; unused until then.
      bundleIdentifier: appId,
      buildNumber: String(version.versionCode),
      supportsTablet: false,
    },

    plugins: [
      'expo-router',

      // Embed fonts at build time: no runtime loading, so text is styled on
      // the first frame. Family name = file name without extension.
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/JetBrainsMono-Regular.ttf',
            './assets/fonts/JetBrainsMono-Medium.ttf',
            './assets/fonts/JetBrainsMono-Bold.ttf',
          ],
        },
      ],

      // Black splash with the green mark; no white flash on any Android
      // version (this also configures the Android 12+ splash screen API).
      [
        'expo-splash-screen',
        {
          image: './assets/icon/splash.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: BLACK,
          dark: { image: './assets/icon/splash.png', backgroundColor: BLACK },
        },
      ],

      // Native build settings (PLAN §4 "Build config").
      [
        'expo-build-properties',
        {
          android: {
            // arm64 only: smaller APKs and faster builds. Covers essentially
            // every phone from recent years (PLAN §15.6). Also used for dev,
            // since the test phone is arm64.
            buildArchs: ['arm64-v8a'],
            // R8 code shrinking plus resource shrinking for release (PLAN §5 size budgets).
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            // Store native libraries compressed in the APK. This cuts the
            // download by roughly 10 MB (PLAN §5 APK budget); the trade-off
            // is that Android extracts them on install, so installed size
            // grows a little.
            useLegacyPackaging: true,
          },
        },
      ],

      // Release only: sign with the local release key (PLAN §15.3).
      ...(isDev ? [] : ['./plugins/withReleaseSigning']),
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      // Shown in Help as "v0.1.0 (build 1)" (PLAN §15.4).
      variant,
      versionName: version.versionName,
      versionCode: version.versionCode,
    },
  };
}

/** Entry point Expo calls when reading the config. */
export default ({ config }: ConfigContext): ExpoConfig => buildConfig(getVariant(), config);
