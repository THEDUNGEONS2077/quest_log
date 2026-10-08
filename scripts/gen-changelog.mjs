// scripts/gen-changelog.mjs: bundles the latest CHANGELOG.md sections for
// the in-app "What's new" screen (PLAN §9.19).
//
// Writes assets/changelog.json from CHANGELOG.md using lib/changelog.ts
// (loaded directly; Node 23.6+ strips TypeScript types). Run by
// `npm run changelog` and by `npm run android:release`; a test fails when
// the JSON is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseChangelog } from '../lib/changelog.ts';

// Paths relative to the repo root, wherever the script is run from.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

// Same formatting as the test's comparison: 2-space JSON plus a newline.
writeFileSync(join(root, 'assets/changelog.json'), `${JSON.stringify(parseChangelog(md), null, 2)}\n`);
console.log('assets/changelog.json updated');
