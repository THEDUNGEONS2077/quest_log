/**
 * plugins/withRemoveInternet.js: strip the INTERNET permission from release
 * builds (PLAN §3).
 *
 * React Native and some libraries declare INTERNET in their own manifests,
 * and Android merges every library manifest into the app's. Simply leaving
 * the permission out of our manifest is not enough. Declaring it with
 * `tools:node="remove"` tells the manifest merger to delete it from the final
 * APK, so the release app is physically unable to go online.
 *
 * Applied only when APP_VARIANT=release (see app.config.ts); the dev build
 * needs INTERNET to reach Metro. Verified by `aapt2 dump permissions` in the
 * release script.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const INTERNET = 'android.permission.INTERNET';

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withRemoveInternet = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // The `tools:` attribute needs the tools namespace on the <manifest> root.
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Drop any plain INTERNET entry Expo added, then add a single removal marker.
    const perms = (manifest['uses-permission'] ?? []).filter(
      (p) => p.$['android:name'] !== INTERNET,
    );
    perms.push({ $: { 'android:name': INTERNET, 'tools:node': 'remove' } });
    manifest['uses-permission'] = perms;

    return cfg;
  });

module.exports = withRemoveInternet;
