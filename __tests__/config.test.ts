/**
 * __tests__/config.test.ts: checks that app.config.ts produces the right
 * app for each build variant (PLAN §15.2).
 *
 * These guarantees matter because they can't be fixed after friends
 * install: the release package ID is permanent, and the release build must
 * never keep INTERNET or ship unsigned.
 */
import { buildConfig, getVariant } from '../app.config';
import version from '../version.json';

/** The plugin entries as plain names (strings or the first item of [name, options]). */
const pluginNames = (variant: 'dev' | 'release') =>
  (buildConfig(variant).plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));

describe('getVariant', () => {
  it('defaults to dev so `expo start` never builds release config by accident', () => {
    expect(getVariant({})).toBe('dev');
  });

  it('rejects unknown variants', () => {
    expect(() => getVariant({ APP_VARIANT: 'prod' })).toThrow(/APP_VARIANT/);
  });
});

describe('release variant', () => {
  const cfg = buildConfig('release');

  it('uses the permanent app ID and the plain name', () => {
    expect(cfg.android?.package).toBe('com.thedungeons2077.questlog');
    expect(cfg.ios?.bundleIdentifier).toBe('com.thedungeons2077.questlog');
    expect(cfg.name).toBe('quest_log');
    expect(cfg.scheme).toBe('questlog');
  });

  it('signs with the release key', () => {
    expect(pluginNames('release')).toContain('./plugins/withReleaseSigning');
  });

  it('blocks INTERNET and every unused default permission', () => {
    expect(cfg.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.INTERNET',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ]),
    );
  });

  it('requests only the allow-listed permissions', () => {
    expect(cfg.android?.permissions).toEqual(['android.permission.VIBRATE']);
  });

  it('takes its version from version.json', () => {
    expect(cfg.version).toBe(version.versionName);
    expect(cfg.android?.versionCode).toBe(version.versionCode);
  });
});

describe('dev variant', () => {
  const cfg = buildConfig('dev');

  it('installs side by side with release', () => {
    expect(cfg.android?.package).toBe('com.thedungeons2077.questlog.dev');
    expect(cfg.name).toBe('quest_log DEV');
    expect(cfg.scheme).toBe('questlog-dev');
    expect(cfg.icon).toContain('-dev');
  });

  it('keeps INTERNET (needed for Metro) and the debug key', () => {
    expect(buildConfig('dev').android?.blockedPermissions).toEqual([]);
    expect(pluginNames('dev')).not.toContain('./plugins/withReleaseSigning');
  });
});
