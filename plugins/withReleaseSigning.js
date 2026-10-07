/**
 * plugins/withReleaseSigning.js: sign release builds with the local release
 * keystore (PLAN §15.3).
 *
 * The generated android/app/build.gradle signs `release` with the debug key
 * by default. This plugin adds a `release` signing config whose values come
 * from Gradle properties in ~/.gradle/gradle.properties (never committed):
 *
 *   QUESTLOG_STORE_FILE=/home/<you>/.quest_log/release.keystore
 *   QUESTLOG_STORE_PASSWORD=...
 *   QUESTLOG_KEY_ALIAS=questlog
 *   QUESTLOG_KEY_PASSWORD=...
 *
 * If any of them is missing, the release build fails with a clear message
 * instead of silently producing a debug-signed APK. A debug-signed APK can't
 * update a friend's install, and installing it would force them to
 * uninstall and lose their tasks.
 *
 * Applied only when APP_VARIANT=release (see app.config.ts).
 */
const { withAppBuildGradle } = require('expo/config-plugins');

// Marker comment, so re-running prebuild doesn't insert the block twice.
const MARKER = '// @quest_log release signing';

// Groovy inserted into the `signingConfigs { }` block.
const SIGNING_CONFIG = `
        ${MARKER}
        release {
            def required = ['QUESTLOG_STORE_FILE', 'QUESTLOG_STORE_PASSWORD', 'QUESTLOG_KEY_ALIAS', 'QUESTLOG_KEY_PASSWORD']
            def missing = required.findAll { !project.hasProperty(it) }
            if (!missing.isEmpty()) {
                throw new GradleException("quest_log release signing: missing " + missing.join(', ') + " in ~/.gradle/gradle.properties (see RELEASING.md)")
            }
            storeFile file(QUESTLOG_STORE_FILE)
            storePassword QUESTLOG_STORE_PASSWORD
            keyAlias QUESTLOG_KEY_ALIAS
            keyPassword QUESTLOG_KEY_PASSWORD
        }`;

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARKER)) return cfg;

    // 1. Add the release signing config right after `signingConfigs {`.
    if (!/signingConfigs\s*\{/.test(gradle)) {
      throw new Error('withReleaseSigning: no signingConfigs block found in app/build.gradle');
    }
    gradle = gradle.replace(/signingConfigs\s*\{/, (m) => m + SIGNING_CONFIG);

    // 2. Point the release build type at it. The template's release block
    //    contains `signingConfig signingConfigs.debug`; swap only that one
    //    (the debug build type keeps the debug key).
    const releaseBlock = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
    if (!releaseBlock.test(gradle)) {
      throw new Error('withReleaseSigning: could not find the release signingConfig line in app/build.gradle');
    }
    gradle = gradle.replace(releaseBlock, '$1signingConfig signingConfigs.release');

    cfg.modResults.contents = gradle;
    return cfg;
  });

module.exports = withReleaseSigning;
