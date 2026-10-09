// e2e/web/navigation.mjs: walks every navigation path of the app and checks
// where each one lands (`npm run web:nav`, after `npm run web:export`).
//
// A local test harness only: it drives the web build (the same screens and
// router as the Android app) in headless Chromium at a phone's size. The
// Android back button itself is covered by Jest (store backStep). Every
// screen is screenshotted to e2e/web/screenshots/nav-*.png for comparing
// headers and close buttons side by side.
//
// The static server is the serve binary itself (not `npx serve`, whose child
// process would outlive it), bound to 127.0.0.1, and always stopped.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, devices } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shots = join(root, 'e2e/web/screenshots');
mkdirSync(shots, { recursive: true });
const PORT = 8138;
const URL = `http://127.0.0.1:${PORT}/`;

const server = spawn(join(root, 'node_modules/.bin/serve'), ['-s', 'web-dist', '-l', `tcp://127.0.0.1:${PORT}`, '--no-port-switching'], {
  cwd: root,
  stdio: 'ignore',
});
for (let i = 0; i < 50; i++) {
  try {
    await fetch(URL);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch();
// The test phone's size (Galaxy S25 Ultra: 384 × 832 dp), with touch.
const context = await browser.newContext({ ...devices['iPhone 15'], viewport: { width: 384, height: 832 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;

/** One navigation check: runs the steps, then asserts where we are. */
async function path(name, fn) {
  try {
    await fn();
    if (errors.length) throw new Error(`page error: ${errors.splice(0).join(' | ')}`);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✕ ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: join(shots, `nav-FAILED-${name}.png`) }).catch(() => {});
  }
}
const shot = (name) => page.screenshot({ path: join(shots, `nav-${name}.png`) });
const tap = (label) => page.getByLabel(label).first().click();
/** Asserts that `text` is visible (a regex or exact string). */
const see = (text) => page.getByText(text).first().waitFor({ state: 'visible', timeout: 4000 });
/** Asserts we're on the main screen (the quest tabs are there). */
const onMain = () => page.getByLabel(/^all quests/i).waitFor({ state: 'visible', timeout: 4000 });
/** Long-presses the row titled `title` (a touch hold, which opens its menu). */
async function hold(title) {
  const box = await page.getByText(title).first().boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.synthesizeTapGesture', {
    x: box.x + 30,
    y: box.y + box.height / 2,
    duration: 900,
    tapCount: 1,
    gestureSourceType: 'touch',
  });
}
/** Throws unless the element labelled `label` is gone. */
async function gone(label, message) {
  if (await page.getByLabel(label).count()) throw new Error(message);
}

try {
  await page.goto(URL);
  await page.getByText('tap to skip').click();
  await tap('Load example tasks');
  await page.waitForTimeout(400);
  await shot('main');

  await path('help: open and close', async () => {
    await tap('User guide');
    await see('> help');
    await shot('help');
    await tap('Close guide');
    await onMain();
  });

  await path('settings → guide → back to settings', async () => {
    await tap('Settings');
    await see('> settings');
    await shot('settings');
    await page.getByText('User guide').last().click();
    await see('> help');
    await tap('Close guide');
    await see('> settings');
  });

  await path("settings → what's new → back to settings", async () => {
    await page.getByText("What's new").last().click();
    await see("> what's new");
    await shot('whats-new');
    await tap("Close what's new");
    await see('> settings');
  });

  await path('settings → trash → back to settings → main', async () => {
    await page.getByText('Trash', { exact: true }).last().click();
    await see('> trash');
    await shot('trash');
    await tap('Close trash');
    await see('> settings');
    await tap('Close settings');
    await onMain();
  });

  await path('browser back closes a pushed screen (stack behaves)', async () => {
    await tap('User guide');
    await see('> help');
    await page.goBack();
    await onMain();
  });

  await path('COMPLETED → trash → back keeps COMPLETED', async () => {
    await tap(/^completed,/);
    await tap('Open Trash');
    await see('> trash');
    await tap('Close trash');
    await see('> NOTHING COMPLETED YET.');
    await tap(/^active,/);
  });

  await path('quest tabs and switch: each tab keeps its own view', async () => {
    await tap(/^daily quests/i);
    await see(/NO DAILY QUESTS/);
    await shot('tab-daily');
    await tap(/^completed,/);
    await see('> NOTHING COMPLETED YET.');
    await tap(/^all quests/i);
    await tap(/^active,/);
    await see(/welcome to quest_log/i);
  });

  await path('search: open, filter, close restores the list', async () => {
    await tap('Search and filter tasks');
    await page.keyboard.type('milk');
    await see(/^milk$/i);
    await shot('search');
    await tap('Close search');
    await see(/plan the weekend/i);
  });

  await path('zoom into a quest and back out with the breadcrumb', async () => {
    const box = await page
      .getByText(/^groceries$/i)
      .first()
      .boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.synthesizeTapGesture', {
      x: box.x + 30,
      y: box.y + box.height / 2,
      duration: 900,
      tapCount: 1,
      gestureSourceType: 'touch',
    });
    await see('Zoom into');
    await shot('menu');
    await page.getByText('Zoom into').click();
    await see(/^milk$/i);
    await shot('zoomed');
    // Zoomed in, objectives stay objectives: no quest "+" on them.
    if (await page.getByLabel('Add subtask to Milk').count()) throw new Error('objectives look like quests when zoomed in');
    await tap('Back to all quests');
    await see(/plan the weekend/i);
  });

  await path('menu → Move to… → cancel returns to the list', async () => {
    // A row in clear view (not under the quick-add bar at the bottom edge).
    const box = await page
      .getByText(/^groceries$/i)
      .first()
      .boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.synthesizeTapGesture', {
      x: box.x + 30,
      y: box.y + box.height / 2,
      duration: 900,
      tapCount: 1,
      gestureSourceType: 'touch',
    });
    await page.getByText('Move to…').click();
    await see(/MOVE "Groceries" TO/i);
    await shot('move-picker');
    await tap('Cancel move');
    await see(/plan the weekend/i);
  });

  await path('quest tab: the breadcrumb names the tab; tapping the tab again zooms out', async () => {
    await tap(/^main quests/i);
    await hold(/^groceries$/i);
    await page.getByText('Zoom into').click();
    await see('← MAIN');
    await shot('zoomed-main');
    await tap(/^main quests/i); // the selected tab, again
    await see(/^groceries$/i);
    await gone('Back to main quests', 'still zoomed in after tapping the selected tab');
    await tap(/^all quests/i);
  });

  await path('the title goes home from anywhere (ALL · ACTIVE · top level)', async () => {
    await tap(/^daily quests/i);
    await tap(/^completed,/);
    await see('> NOTHING COMPLETED YET.');
    await tap(/^quest_log, level/);
    await see(/plan the weekend/i);
    const selected = await page.getByLabel(/^all quests/i).getAttribute('aria-selected');
    if (selected !== 'true') throw new Error('ALL is not the selected tab after going home');
    await gone('Close search', 'search still open after going home');
  });

  await path('edit a task, then switch tab: editing ends, nothing left open', async () => {
    await page
      .getByText(/^plan the weekend$/i)
      .first()
      .click();
    await page.getByLabel('Done editing').waitFor();
    await tap(/^main quests/i);
    if (await page.getByLabel('Done editing').count()) throw new Error('the edit toolbar is still open after switching tab');
    await tap(/^all quests/i);
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `\n${failed} navigation path(s) failed` : '\nall navigation paths passed');
process.exit(failed ? 1 : 0);
