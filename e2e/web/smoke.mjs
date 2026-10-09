// e2e/web/smoke.mjs: end-to-end checks of the web build / iPhone PWA, in a
// headless browser emulating an iPhone 15 (`npm run web:test`).
//
// Serves web-dist/ (build it first: `npm run web:export`), then walks the
// main journeys and fails on the first broken one or on any page error:
//   first run → example tasks → quick-add with shorthand → complete + UNDO
//   → data survives a reload → the app opens OFFLINE (service worker)
//   → due date through the browser picker → amend it (sheet fits the screen)
//   → backup save and import.
// Screenshots of each step go to e2e/web/screenshots/ (git-ignored).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, devices } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shots = join(root, 'e2e/web/screenshots');
mkdirSync(shots, { recursive: true });
const PORT = 8137;
const URL = `http://localhost:${PORT}/`;

// Static server for web-dist (SPA fallback, like GitHub Pages' 404.html).
// Restartable: the offline check stops it for real.
const startServer = () =>
  spawn('npx', ['serve', '-s', 'web-dist', '-l', String(PORT), '--no-port-switching'], { cwd: root, stdio: 'ignore' });
let server = startServer();
const stop = () => server.kill();
/** Resolves once the server answers. */
async function serverUp() {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(URL);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('static server did not start');
}

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 15'], acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let n = 0;
/** Runs one named check; screenshots after it. Throws (ending the run) on failure. */
async function check(name, fn) {
  try {
    await fn();
    await page.screenshot({ path: join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) });
    if (errors.length) throw new Error(`page error: ${errors.join(' | ')}`);
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✕ ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: join(shots, `FAILED-${name}.png`) }).catch(() => {});
    await browser.close();
    stop();
    process.exit(1);
  }
}
const visible = (text) => page.getByText(text).first().waitFor({ state: 'visible', timeout: 5000 });

await serverUp();

await check('boot-screen', async () => {
  await page.goto(URL);
  await visible('tap to skip');
  await page.getByText('tap to skip').click();
});

await check('empty-state', () => visible(/NO ACTIVE QUESTS/));

await check('example-tasks-and-undo', async () => {
  await page.getByLabel('Load example tasks').click();
  await visible(/welcome to quest_log/i);
  await page.getByLabel('Undo').click();
  await visible(/NO ACTIVE QUESTS/);
});

await check('quick-add-with-shorthand', async () => {
  const input = page.getByLabel('New task');
  await input.click();
  await input.fill('Buy milk');
  await input.press('Enter');
  await visible(/buy milk/i);
  await input.click();
  await input.fill('Trip !!!');
  await input.press('Enter');
  await visible(/^trip$/i);
  await visible('!!!');
});

await check('complete-and-undo', async () => {
  await page.getByLabel('Complete Buy milk').click();
  await visible('COMPLETED');
  await page.getByLabel('Undo').click();
  await visible(/buy milk/i);
});

await check('survives-reload', async () => {
  await page.waitForTimeout(800); // past the 300 ms save throttle
  await page.reload();
  await page
    .getByText('tap to skip')
    .click({ timeout: 3000 })
    .catch(() => {}); // boot runs once per launch
  await visible(/buy milk/i);
  await visible(/^trip$/i);
});

await check('opens-offline', async () => {
  // The service worker must have stored the app. Then the site really goes away
  // (server stopped: what "no connection" means) and the app is launched again.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  await page.reload();
  await page
    .getByText('tap to skip')
    .click({ timeout: 3000 })
    .catch(() => {});
  await visible(/buy milk/i);
  server = startServer();
  await serverUp();
});

await check('due-date-via-browser-picker', async () => {
  await page
    .getByText(/^trip$/i)
    .first()
    .click(); // edit
  await page.getByLabel('Set due date and reminder').click();
  await visible('Reminders need the Android app. Here, due dates still show and turn OVERDUE.');
  // CUSTOM… opens the browser's picker on a temporary input; answer it like a user would.
  await page.getByText('CUSTOM…').click();
  const picker = page.locator('input[type="datetime-local"]');
  await picker.waitFor({ state: 'attached', timeout: 3000 });
  const next = new Date(Date.now() + 2 * 86_400_000);
  const pad = (v) => String(v).padStart(2, '0');
  await picker.fill(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T16:30`);
  // fill() fires the input's change event, like confirming the picker; the app then removes the input.
  // Choosing a date closes the sheet and ends editing; the row shows the new date.
  await visible(/16:30/);
});

await check('amend-sheet-fits-on-screen', async () => {
  // Bug 2026-10-09: the due sheet outgrew the screen and hid AMEND. Open it for the
  // now-dated task and require the top (AMEND) and bottom (CLEAR DATE) to be on screen.
  await page.getByText(/16:30/).first().click();
  const { height } = page.viewportSize();
  for (const label of ['CHANGE DATE…', 'CHANGE TIME…', '+1 DAY']) {
    const box = await page.getByText(label).first().boundingBox();
    if (!box || box.y < 0 || box.y + box.height > height) throw new Error(`"${label}" is off screen`);
  }
  // On short screens the rest scrolls into view (it must not be cut off).
  const clear = page.getByText('CLEAR DATE').first();
  await clear.scrollIntoViewIfNeeded();
  const box = await clear.boundingBox();
  if (!box || box.y + box.height > height) throw new Error('"CLEAR DATE" cannot be scrolled into view');
  await page.getByText('CHANGE DATE…').first().scrollIntoViewIfNeeded();
  // +1 DAY moves the date and closes the sheet.
  await page.getByLabel('+1 DAY').click();
  await visible(/16:30/);
});

await check('backup-save-and-import', async () => {
  await page.getByLabel('Settings').click();
  await visible('> settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByLabel('Save backup…').click()]);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  if (backup.format !== 'quest_log-backup') throw new Error('downloaded file is not a backup');
  // Import it back: merging the same backup adds nothing.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByLabel('Import a backup…').click()]);
  await chooser.setFiles(path);
  await page.getByText('Merge: add tasks you don’t have').click();
  await visible('NOTHING NEW TO ADD');
});

console.log(`\nweb smoke test passed (${n} checks; screenshots in e2e/web/screenshots)`);
await browser.close();
stop();
