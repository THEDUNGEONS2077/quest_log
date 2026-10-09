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
/** How far the list on screen is scrolled down (px); 0 at its top. */
const listScroll = () =>
  page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('div')].filter((d) => d.offsetParent !== null).map((d) => d.scrollTop)));
/** Scrolls the list on screen down by `px` (the tallest scrollable box on the page). */
const scrollListBy = (px) =>
  page.evaluate((by) => {
    const boxes = [...document.querySelectorAll('div')].filter((d) => d.offsetParent !== null && d.scrollHeight > d.clientHeight + 50);
    const box = boxes.sort((a, b) => b.clientHeight - a.clientHeight)[0];
    if (box) box.scrollTop += by;
  }, px);
/** Throws unless the list on screen is at its top. */
async function atTop(where) {
  await page.waitForTimeout(250);
  const y = await listScroll();
  if (y > 2) throw new Error(`${where}: the list opened ${y}px down, not at the top`);
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

  await path('a quest tab always opens at the top (also when switched while COMPLETED shows)', async () => {
    await tap(/^all quests/i);
    await scrollListBy(400);
    await page.waitForTimeout(250);
    if ((await listScroll()) < 50) throw new Error('could not scroll the list to set up the check');
    await tap(/^main quests/i); // the same quests as ALL: the list must not keep its place
    await atTop('ALL → MAIN');
    await scrollListBy(400);
    await tap(/^completed,/);
    await tap(/^all quests/i); // changed while ACTIVE is hidden
    await tap(/^active,/);
    await atTop('MAIN (scrolled) → COMPLETED → ALL → ACTIVE');
  });

  await path('every tab switch opens at the top: all 32 one-tap moves between the 8 views', async () => {
    // A long list on every quest tab, open and completed ("- [x]" lines paste as done).
    for (const [tab, name] of [
      [/^daily quests/i, 'Daily'],
      [/^main quests/i, 'Main'],
      [/^misc quests/i, 'Misc'],
    ]) {
      await tap(tab);
      await tap(/^active,/);
      const lines = [];
      for (let i = 1; i <= 14; i++) lines.push(`${name} quest ${i}`, `- [x] ${name} done ${i}`);
      await page.getByLabel('New quest').fill(lines.join('\n'));
      await page.waitForTimeout(300);
    }
    const quest = { ALL: /^all quests/i, DAILY: /^daily quests/i, MAIN: /^main quests/i, MISC: /^misc quests/i };
    const view = { ACTIVE: /^active,/, COMPLETED: /^completed,/ };
    let checked = 0;
    for (const q of Object.keys(quest)) {
      for (const v of Object.keys(view)) {
        // From q · v: every other quest tab (same switch), and the other switch half.
        const moves = [
          ...Object.keys(quest)
            .filter((t) => t !== q)
            .map((t) => [t, v]),
          [q, v === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE'],
        ];
        for (const [tq, tv] of moves) {
          await tap(quest[q]);
          await tap(view[v]);
          await scrollListBy(600);
          await page.waitForTimeout(150);
          if ((await listScroll()) < 50) throw new Error(`${q} · ${v}: the list didn't scroll, so the move can't be checked`);
          await tap(tq === q ? view[tv] : quest[tq]);
          await atTop(`${q} · ${v} → ${tq} · ${tv}`);
          checked++;
        }
      }
    }
    if (checked !== 32) throw new Error(`checked ${checked} moves, expected 32`);
  });

  await path('re-tapping the selected tab, and the title, go to the top', async () => {
    await tap(/^all quests/i);
    await tap(/^active,/);
    await scrollListBy(600);
    await tap(/^all quests/i); // the selected tab, again
    await page.waitForTimeout(400); // an animated scroll
    await atTop('ALL tapped again');
    await scrollListBy(600);
    await tap(/^quest_log, level/);
    await page.waitForTimeout(400);
    await atTop('title (home)');
  });

  await path('zoom: in opens at the top; out returns to where you were', async () => {
    await tap(/^main quests/i);
    await tap(/^active,/);
    // A group with objectives, then newer quests above it, so it sits a little way down.
    await page.getByLabel('New quest').fill('Zoom group\n  - [ ] Step A\n  - [ ] Step B');
    await page.waitForTimeout(300);
    await page.getByLabel('New quest').fill('Filler 1\nFiller 2\nFiller 3');
    await page.waitForTimeout(400);
    await scrollListBy(120);
    await page.waitForTimeout(250);
    const before = await listScroll();
    if (before < 60) throw new Error(`could not scroll to set up the check (${before}px)`);
    await hold(/^zoom group$/i);
    await page.getByText('Zoom into').click();
    await see('← MAIN');
    await atTop('zoomed into a quest');
    await tap('Back to main quests');
    await page.waitForTimeout(300);
    const after = await listScroll();
    if (Math.abs(after - before) > 16) throw new Error(`zoomed out to ${after}px, was at ${before}px`);
  });

  await path('edit a task, then switch tab: editing ends, nothing left open', async () => {
    await tap(/^all quests/i);
    await tap(/^active,/);
    // The newest quest (from the zoom check), at the top of ALL.
    await page
      .getByText(/^filler 1$/i)
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
